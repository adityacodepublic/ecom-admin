import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { OrderError } from "@/lib/orders/errors";

/**
 * A shopper's cart, saved to their account (table "CartItem", one row per product per store).
 * The store sends only what changed ("product X is now 3", 0 = removed) and gets the whole cart back.
 * Quantities are absolute, not "+1", so a repeated request gives the same result.
 */
export const CART_MAX_LINES = 100;
const CART_MAX_QUANTITY = 10_000;

export const cartChangesSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(100),
            quantity: z.number().int().min(0).max(CART_MAX_QUANTITY),
          })
          .strict(),
      )
      .max(CART_MAX_LINES),
    // Sign-in: the browser's cart joins the saved one. A product in both keeps the larger quantity.
    merge: z.boolean().optional(),
  })
  .strict();
export type CartChanges = z.infer<typeof cartChangesSchema>;

// The same fields as the public product GET, so the store shows a cart line the same way.
const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  isFeatured: true,
  isArchived: true,
  quantity: true,
  maxQuantity: true,
  images: { orderBy: { order: "asc" }, select: { url: true, order: true } },
  category: { select: { id: true, name: true } },
  filteritems: { select: { value: { select: { value: true, unit: true, filter: { select: { name: true } } } } } },
} satisfies Prisma.ProductSelect;

/** How many one shopper may buy now (the same rule as the store's quantity check). */
const allowedOf = (p: { quantity: number; maxQuantity: number }) => Math.max(0, Math.min(p.quantity, p.maxQuantity || p.quantity));

/**
 * The saved cart, oldest line first. Deleted or archived products are removed for good. Out-of-stock ones stay,
 * with their stock (quantity) 0, so the store shows them as out of stock. A quantity above what is allowed is lowered.
 */
export async function getCart(storeId: string, customerId: string) {
  const rows = await prismadb.cartItem.findMany({ where: { storeId, customerId }, orderBy: { createdAt: "asc" } });
  if (rows.length === 0) return { items: [] };

  const products = await prismadb.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) }, storeId, isArchived: false },
    select: PRODUCT_SELECT,
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const gone: string[] = [];
  const lowered: { id: string; quantity: number }[] = [];
  const items = [];
  for (const row of rows) {
    const product = byId.get(row.productId);
    if (!product) {
      gone.push(row.id);
      continue;
    }
    const allowed = allowedOf(product);
    if (allowed <= 0) {
      items.push({ ...product, orderQuantity: row.quantity });
      continue;
    }
    const quantity = Math.min(row.quantity, allowed);
    if (quantity !== row.quantity) lowered.push({ id: row.id, quantity });
    items.push({ ...product, orderQuantity: quantity });
  }

  if (gone.length || lowered.length) {
    await prismadb.$transaction([
      prismadb.cartItem.deleteMany({ where: { id: { in: gone } } }),
      ...lowered.map((l) => prismadb.cartItem.update({ where: { id: l.id }, data: { quantity: l.quantity } })),
    ]);
  }
  return { items };
}

/** Saves the changes, then returns the whole cart (getCart). Products of other stores are ignored. */
export async function saveCartChanges(storeId: string, customerId: string, body: CartChanges) {
  // The last change of a product wins.
  const latest = new Map(body.changes.map((c) => [c.productId, c.quantity]));
  const known = new Set(
    (
      await prismadb.product.findMany({
        where: { id: { in: Array.from(latest.keys()) }, storeId, isArchived: false },
        select: { id: true },
      })
    ).map((p) => p.id),
  );

  const removed = Array.from(latest).filter(([, q]) => q === 0).map(([id]) => id);
  const set = Array.from(latest).filter(([id, q]) => q > 0 && known.has(id));

  if (removed.length || set.length) {
    await prismadb.$transaction(async (tx) => {
      if (removed.length) await tx.cartItem.deleteMany({ where: { storeId, customerId, productId: { in: removed } } });
      if (set.length) {
        const ids = set.map(([id]) => id);
        const quantities = set.map(([, q]) => q);
        // One statement: a second device saving at the same moment cannot make a duplicate row.
        // New lines get 1 ms apart, in the order sent, so the cart keeps the shopper's order.
        const newQuantity = body.merge
          ? Prisma.sql`GREATEST("CartItem"."quantity", EXCLUDED."quantity")`
          : Prisma.sql`EXCLUDED."quantity"`;
        await tx.$executeRaw`
          INSERT INTO "CartItem" ("id", "storeId", "customerId", "productId", "quantity", "createdAt", "updatedAt")
          SELECT gen_random_uuid()::text, ${storeId}, ${customerId}, t.p, t.q, now() + t.n * interval '1 millisecond', now()
          FROM unnest(${ids}::text[], ${quantities}::int[]) WITH ORDINALITY AS t(p, q, n)
          ON CONFLICT ("customerId", "storeId", "productId")
          DO UPDATE SET "quantity" = ${newQuantity}, "updatedAt" = now()`;
        const lines = await tx.cartItem.count({ where: { storeId, customerId } });
        if (lines > CART_MAX_LINES) {
          throw new OrderError("VALIDATION", `A cart can hold up to ${CART_MAX_LINES} different products.`);
        }
      }
    });
  }
  return getCart(storeId, customerId);
}

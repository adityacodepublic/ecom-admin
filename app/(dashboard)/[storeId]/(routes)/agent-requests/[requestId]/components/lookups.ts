import prismadb from "@/lib/prismadb";
import type { AgentRequest } from "@/lib/agent/store";

/** Names looked up on the server (always scoped to this store) so the approval screen can say "Update product “Blue Shirt”". */
export type Lookups = {
  /** Current name of the record the path points to (update/delete). */
  targetName?: string;
  /** Order number when the path points to an order. */
  orderNumber?: number;
  categoryName?: string;
  billboardName?: string;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 200 ? v : undefined);

export async function loadLookups(storeId: string, r: AgentRequest): Promise<Lookups> {
  const out: Lookups = {};
  try {
    const [feature, id] = r.path.split("/").filter(Boolean);
    const body = isObject(r.body) ? r.body : {};

    if (id && r.method !== "POST") {
      if (feature === "products") {
        out.targetName = (await prismadb.product.findFirst({ where: { id, storeId }, select: { name: true } }))?.name;
      } else if (feature === "categories") {
        out.targetName = (await prismadb.category.findFirst({ where: { id, storeId }, select: { name: true } }))?.name;
      } else if (feature === "billboards") {
        out.targetName = (await prismadb.billboard.findFirst({ where: { id, storeId }, select: { label: true } }))?.label;
      } else if (feature === "filters") {
        out.targetName = (await prismadb.filter.findFirst({ where: { id, storeId }, select: { name: true } }))?.name;
      } else if (feature === "media") {
        out.targetName = (await prismadb.mediaImage.findFirst({ where: { id, storeId }, select: { name: true } }))?.name ?? undefined;
      } else if (feature === "orders") {
        const num = /^#?(\d{1,9})$/.exec(id);
        const order = await prismadb.order.findFirst({
          where: num ? { storeId, orderNumber: Number(num[1]) } : { storeId, id },
          select: { orderNumber: true },
        });
        out.orderNumber = order?.orderNumber;
      }
    }

    const categoryId = str(body.categoryId);
    if (categoryId) {
      out.categoryName = (await prismadb.category.findFirst({ where: { id: categoryId, storeId }, select: { name: true } }))?.name;
    }
    const billboardId = str(body.billboardId);
    if (billboardId) {
      out.billboardName = (await prismadb.billboard.findFirst({ where: { id: billboardId, storeId }, select: { label: true } }))?.label;
    }
  } catch (error) {
    // Lookups are only a convenience; the screen falls back to ids.
    console.log("[AGENT_REQUEST_LOOKUPS]", error);
  }
  return out;
}

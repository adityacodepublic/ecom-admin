import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getUserId } from "@/lib/agent/context";
import { toPaise } from "@/lib/money";
import prismadb from "@/lib/prismadb";

/** Body checks shared by the product and category routes. They run BEFORE anything is written. */

export type Checked<T> = { ok: true; data: T } | { ok: false; error: string };

const isWebUrl = (u: unknown): u is string => {
  if (typeof u !== "string" || !u.trim()) return false;
  try {
    const p = new URL(u).protocol; // http:// links exist in older data and must stay editable; javascript:, data: etc. are rejected
    return p === "https:" || p === "http:";
  } catch {
    return false;
  }
};

/**
 * A product's price: rupees with at most 2 decimals, above 0 (the column is Decimal(12,2)), or null for
 * "Price on request" (the product is bought through a quote). Missing / empty is refused: null must be meant.
 */
export function checkPrice(price: unknown): Checked<string | null> {
  if (price === null) return { ok: true, data: null };
  if (price === undefined || price === "") return { ok: false, error: "Price is required (or null for Price on request)" };
  try {
    if ((typeof price !== "string" && typeof price !== "number") || toPaise(price) <= 0) throw new Error();
    return { ok: true, data: String(price) };
  } catch {
    return { ok: false, error: "Price must be a positive amount with at most 2 decimals" };
  }
}

export type CheckedImage = { url: string; order?: number; href?: string };

/** images: a non-empty array of { url (http or https), order? (whole number), href? (text, only with opts.href) }. */
export function checkImages(images: unknown, opts: { href?: boolean } = {}): Checked<CheckedImage[]> {
  if (images === undefined || images === null || (Array.isArray(images) && images.length === 0)) {
    return { ok: false, error: "Images are required" };
  }
  if (!Array.isArray(images)) return { ok: false, error: "Images must be an array" };
  const out: CheckedImage[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i] as { url?: unknown; order?: unknown; href?: unknown } | null;
    if (!img || typeof img !== "object" || Array.isArray(img)) return { ok: false, error: `Image ${i + 1} must be an object` };
    if (!isWebUrl(img.url)) return { ok: false, error: `Image ${i + 1}: url must be a web link (http or https)` };
    if (img.order !== undefined && img.order !== null && !(typeof img.order === "number" && Number.isInteger(img.order))) {
      return { ok: false, error: `Image ${i + 1}: order must be a whole number` };
    }
    if (opts.href && img.href !== undefined && img.href !== null && typeof img.href !== "string") {
      return { ok: false, error: `Image ${i + 1}: href must be text` };
    }
    const item: CheckedImage = { url: img.url };
    if (typeof img.order === "number") item.order = img.order;
    if (opts.href) item.href = typeof img.href === "string" ? img.href : "";
    out.push(item);
  }
  return { ok: true, data: out };
}

/** filteritems: optional; when present an array of objects with a non-empty valueId. Returns the value ids. */
export function checkFilterItems(items: unknown): Checked<string[]> {
  if (items === undefined || items === null) return { ok: true, data: [] };
  if (!Array.isArray(items)) return { ok: false, error: "Filter items must be an array" };
  const ids: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const v = (items[i] as { valueId?: unknown } | null)?.valueId;
    if (typeof v !== "string" || !v) return { ok: false, error: `Filter item ${i + 1}: valueId is required` };
    ids.push(v);
  }
  return { ok: true, data: ids };
}

/**
 * True only when the caller is the signed-in owner of this store (browser session or the agent proxy).
 * Never throws: no session (store front, scripts) simply means "public".
 */
export async function callerOwnsStore(storeId: string | undefined): Promise<boolean> {
  if (!storeId) return false;
  try {
    const userId = await getUserId();
    if (!userId) return false;
    return !!(await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } }));
  } catch {
    return false;
  }
}

/** 409 for "still in use" delete failures (Prisma P2014 / P2003), otherwise null. */
export function inUseResponse(error: unknown, message: string, headers?: HeadersInit): NextResponse | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2014" || error.code === "P2003")) {
    return new NextResponse(message, { status: 409, headers });
  }
  return null;
}

export const PAGE_MAX = 100000;
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;

/** ?page= (1..100000, default 1) and ?pageSize= (1..100, default 50). Empty values mean "default". */
export function parsePaging(params: URLSearchParams): Checked<{ page: number; pageSize: number }> {
  const read = (key: string, def: number, max: number): number | null => {
    const raw = params.get(key);
    if (raw === null || raw === "") return def;
    if (!/^\d{1,9}$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 && n <= max ? n : null;
  };
  const page = read("page", 1, PAGE_MAX);
  if (page === null) return { ok: false, error: `page must be a whole number from 1 to ${PAGE_MAX}` };
  const pageSize = read("pageSize", PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
  if (pageSize === null) return { ok: false, error: `pageSize must be a whole number from 1 to ${PAGE_SIZE_MAX}` };
  return { ok: true, data: { page, pageSize } };
}

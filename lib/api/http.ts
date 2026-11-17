import { NextResponse } from "next/server";
import { ZodError, ZodTypeAny, z } from "zod";

import { OrderError, isOrderError } from "@/lib/orders/errors";
import { storeAppOrigin } from "@/lib/store-url";

/**
 * Small helpers for the order routes: one error shape ({ error: { code, message, details? } }),
 * body checking with zod, and CORS limited to the store app's origin(s).
 */

/** Is this browser Origin the store app? Path mode: NEXT_PUBLIC_STORE_URL. Subdomain mode: any <slug>.<root domain>. */
export function isStoreOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === storeAppOrigin()) return true;
  if (process.env.NEXT_PUBLIC_TENANT_MODE === "subdomain") {
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    const protocol = process.env.NEXT_PUBLIC_STORE_PROTOCOL || "https";
    if (!root) return false;
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${protocol}://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.${escaped}$`).test(origin);
  }
  return false;
}

/** CORS headers: only for the store's origin; any other origin gets none (the browser then blocks it). */
export function storeCors(req: Request, methods = "GET, POST, PATCH, DELETE, OPTIONS"): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!isStoreOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

export function errorResponse(error: unknown, tag: string, headers?: Record<string, string>) {
  if (isOrderError(error)) {
    const body: { code: string; message: string; details?: unknown } = { code: error.code, message: error.message };
    if (error.details !== undefined) body.details = error.details;
    return json({ error: body }, { status: error.status, headers });
  }
  if (error instanceof ZodError) {
    return json({ error: { code: "VALIDATION", message: "Invalid request", details: error.flatten() } }, { status: 400, headers });
  }
  console.error(`[${tag}]`, error);
  return json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500, headers });
}

/** Reads and checks a JSON body. Throws OrderError VALIDATION. */
export async function readBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new OrderError("VALIDATION", "The body must be JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new OrderError("VALIDATION", r.error.issues[0]?.message ?? "Invalid request", r.error.flatten());
  return r.data;
}

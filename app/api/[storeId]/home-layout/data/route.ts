import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { storeUrl } from "@/lib/store-url";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * What the `data` block of a custom home-page section returns: ?data=<url-encoded JSON>, e.g.
 * {"deals":{"source":"products","search":"under 2000","limit":8}}. The store resolves it (its search and product
 * rules live there), so this asks the store's /preview/data and passes the answer on. Public catalog data only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true } });
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404, headers: corsHeaders });

    const data = new URL(req.url).searchParams.get("data") ?? "{}";
    if (data.length > 20_000) return NextResponse.json({ error: "data is too long" }, { status: 400, headers: corsHeaders });

    const res = await fetch(`${storeUrl(store.slug)}/preview/data?data=${encodeURIComponent(data)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({ error: "The store did not answer" }));
    return NextResponse.json(body, { status: res.ok ? 200 : res.status === 400 || res.status === 413 ? res.status : 502, headers: corsHeaders });
  } catch (error) {
    console.log("[HOME_LAYOUT_DATA_GET]", error);
    return NextResponse.json({ error: "Could not reach the store. Try again." }, { status: 502, headers: corsHeaders });
  }
}

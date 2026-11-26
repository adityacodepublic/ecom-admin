import { NextResponse } from "next/server";

import { parseCustomDomain } from "@/lib/custom-domain";
import prismadb from "@/lib/prismadb";

// Public, read-only: GET ?domain=shop.mybrand.com -> { slug } or 404. The storefront's proxy asks this for a
// hostname that is not in its build-time CUSTOM_DOMAINS map yet (a domain connected after the last build).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const FOUND_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";
// Short: a domain connected a moment ago must start working soon, not after an hour of cached 404s.
const NOT_FOUND_CACHE = "public, s-maxage=30";

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: Request) {
  const parsed = parseCustomDomain(new URL(req.url).searchParams.get("domain"));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: { ...corsHeaders, "Cache-Control": NOT_FOUND_CACHE } });
  }
  try {
    const store = await prismadb.store.findUnique({ where: { customDomain: parsed.domain }, select: { slug: true } });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404, headers: { ...corsHeaders, "Cache-Control": NOT_FOUND_CACHE } });
    }
    return NextResponse.json({ slug: store.slug }, { headers: { ...corsHeaders, "Cache-Control": FOUND_CACHE } });
  } catch (error) {
    console.log("[STORE_BY_DOMAIN_GET]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  }
}

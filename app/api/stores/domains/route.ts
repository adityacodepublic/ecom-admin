import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";

// Public, read-only: { domains: { "<custom domain>": "<slug>" } } for every store whose custom domain is VERIFIED (live on Vercel).
// The storefront's build reads it (scripts/generate-custom-domains.mjs) into its CUSTOM_DOMAINS map, so its
// proxy finds a store by hostname without a network call. Custom domains are public (they are in DNS).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    const stores = await prismadb.store.findMany({
      where: { customDomain: { not: null }, customDomainVerified: true },
      select: { customDomain: true, slug: true },
      orderBy: { customDomain: "asc" },
    });
    const domains: Record<string, string> = {};
    for (const s of stores) if (s.customDomain) domains[s.customDomain] = s.slug;
    return NextResponse.json(
      { domains },
      { headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.log("[STORE_DOMAINS_GET]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  }
}

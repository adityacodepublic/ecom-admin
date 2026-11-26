import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";

// Public, read-only: { stores: [{ slug, customDomainVerified }] } for the 50 most recently updated stores.
// The storefront's build reads it in generateStaticParams() (app/[slug]/layout.tsx) to pre-render those stores' pages.
// A store with customDomainVerified: true is also reachable on its custom domain, which the storefront's proxy rewrites
// to the "_cd-<slug>" segment, so the build pre-renders that segment too. Store slugs are public (they are in the URLs).
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
    const rows = await prismadb.store.findMany({
      select: { slug: true, customDomain: true, customDomainVerified: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const stores = rows.map((s) => ({ slug: s.slug, customDomainVerified: s.customDomainVerified && !!s.customDomain }));
    return NextResponse.json(
      { stores },
      { headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.log("[STORE_SLUGS_GET]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  }
}

import { NextResponse } from "next/server";

import { parseContact } from "@/lib/contact";
import prismadb from "@/lib/prismadb";
import { isValidSlug } from "@/lib/slug";
import { parseClarityProjectId, parseFavicon, parseFooterHtml, parseGoogleSiteVerification, parseLogo, parseLogoOnly, parseNavbarHtml } from "@/lib/store-settings";

// Public: the store app turns the slug in its URL into the store (id, name, logo, favicon, Clarity project id, Search Console
// verification token, navbar and footer HTML, contact details, custom page routes, custom domain) with this.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.toLowerCase();
  const store = isValidSlug(slug)
    ? await prismadb.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, customDomain: true, customDomainVerified: true, settings: true, pageLayouts: true } })
    : null;
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404, headers: corsHeaders });
  }
  // The routes of the owner's custom pages (Store.pageLayouts.custom = { "<route>": blocks }), for the footer's page links.
  const custom = (store.pageLayouts as { custom?: unknown } | null)?.custom;
  const customPages = custom && typeof custom === "object" && !Array.isArray(custom) ? Object.keys(custom).sort() : [];
  return NextResponse.json(
    {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logo: parseLogo(store.settings),
      logoOnly: parseLogoOnly(store.settings),
      favicon: parseFavicon(store.settings),
      clarityProjectId: parseClarityProjectId(store.settings),
      googleSiteVerification: parseGoogleSiteVerification(store.settings),
      navbarHtml: parseNavbarHtml(store.settings),
      footerHtml: parseFooterHtml(store.settings),
      contact: parseContact(store.settings),
      customPages,
      // The owner's own hostname once it is verified ("" = none, or not live yet): the storefront builds canonical URLs on it.
      customDomain: store.customDomainVerified ? (store.customDomain ?? "") : "",
    },
    { headers: corsHeaders },
  );
}

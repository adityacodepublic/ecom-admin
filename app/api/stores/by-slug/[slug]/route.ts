import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { isValidSlug } from "@/lib/slug";
import { parseClarityProjectId, parseLogo, parseLogoOnly } from "@/lib/store-settings";

// Public: the store app turns the slug in its URL into the store (id, name, logo, Clarity project id) with this.
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
    ? await prismadb.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, settings: true } })
    : null;
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404, headers: corsHeaders });
  }
  return NextResponse.json({ id: store.id, name: store.name, slug: store.slug, logo: parseLogo(store.settings), logoOnly: parseLogoOnly(store.settings), clarityProjectId: parseClarityProjectId(store.settings) }, { headers: corsHeaders });
}

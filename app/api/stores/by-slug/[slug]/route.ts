import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { isValidSlug } from "@/lib/slug";

// Public: the store app turns the slug in its URL into the store id with this.
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
    ? await prismadb.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } })
    : null;
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404, headers: corsHeaders });
  }
  return NextResponse.json(store, { headers: corsHeaders });
}

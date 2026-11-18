import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import { randomUUID } from "crypto";

import prismadb from "@/lib/prismadb";
import { homeLayoutSchema } from "@/lib/home-layout";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Public: the store reads its home page layout here. Null = no layout saved yet. */
export async function GET(_req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { homeLayout: true } });
  if (!store) return new NextResponse("Store not found", { status: 404 });
  return NextResponse.json(store.homeLayout, { headers: corsHeaders });
}

/** Owner only: replaces the whole layout. Sections without an id get one. */
export async function PUT(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const userId = await getUserId();
    if (!userId) return new NextResponse("Unauthenticated", { status: 403 });

    const body = await req.json();
    const withIds = Array.isArray(body)
      ? body.map((section) => ({ ...section, id: section?.id || randomUUID() }))
      : body;
    const parsed = homeLayoutSchema.safeParse(withIds);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid layout", issues: parsed.error.issues }, { status: 400 });
    }

    // Billboards and categories named in sections must belong to this store.
    const billboardIds = new Set<string>();
    const categoryIds = new Set<string>();
    for (const s of parsed.data) {
      if (s.type === "carousel") billboardIds.add(s.settings.billboardId);
      if ((s.type === "productList" || s.type === "productGrid") && s.settings.categoryId) categoryIds.add(s.settings.categoryId);
      if (s.type === "custom") {
        for (const q of Object.values(s.settings.data)) if (q.source === "products" && q.categoryId) categoryIds.add(q.categoryId);
      }
    }
    if (billboardIds.size || categoryIds.size) {
      const owned = await prismadb.store.findFirst({ where: { id: storeId, userId }, select: { id: true } });
      if (!owned) return new NextResponse("Unauthorized", { status: 405 });
      const [bCount, cCount] = await Promise.all([
        prismadb.billboard.count({ where: { id: { in: Array.from(billboardIds) }, storeId } }),
        prismadb.category.count({ where: { id: { in: Array.from(categoryIds) }, storeId } }),
      ]);
      if (bCount !== billboardIds.size) return new NextResponse("Billboard not found in this store", { status: 400 });
      if (cCount !== categoryIds.size) return new NextResponse("Category not found in this store", { status: 400 });
    }

    const { count } = await prismadb.store.updateMany({
      where: { id: storeId, userId },
      data: { homeLayout: parsed.data },
    });
    if (count === 0) return new NextResponse("Unauthorized", { status: 405 });

    return NextResponse.json(parsed.data, { headers: corsHeaders });
  } catch (error) {
    console.log("[HOME_LAYOUT_PUT]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { requireStoreOwnerResponse } from "@/lib/api/admin-auth";
import { deleteCustomPage, isPage, readLayout, saveLayout } from "@/lib/page-layouts";
import { revalidateStoreInfo, revalidateStorePageLayouts } from "@/lib/store-revalidate";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type Ctx = { params: Promise<{ storeId: string; page: string }> };

const reply = (status: number, body: unknown) =>
  typeof body === "string" ? new NextResponse(body, { status }) : NextResponse.json(body, { status });

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Public: the store reads the layout of a page here. page = home, category, product, or a custom page's route.
 * A built-in page with no saved layout returns null (the store shows its default). An unknown custom route is a 404.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { storeId, page } = await params;
  const layout = await readLayout(storeId, page);
  if (layout === undefined) return new NextResponse("Store not found", { status: 404 });
  if (layout === "missing") return new NextResponse(`No page at /${page}`, { status: 404, headers: corsHeaders });
  return NextResponse.json(layout, { headers: corsHeaders });
}

/** Owner only: replaces the whole layout of a page (a custom page must exist). Sections without an id get one. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { storeId, page } = await params;
    const owner = await requireStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;

    const result = await saveLayout(storeId, owner.userId, page, await req.json());
    if (!result.ok) return reply(result.status, result.body);
    revalidateStorePageLayouts(storeId);
    return NextResponse.json(result.layout, { headers: corsHeaders });
  } catch (error) {
    console.log("[PAGE_LAYOUT_PUT]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

/** Owner only: deletes a custom page. The home, category and product pages cannot be deleted. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { storeId, page } = await params;
    const owner = await requireStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;
    if (isPage(page)) return new NextResponse(`The ${page} page cannot be deleted.`, { status: 400 });

    const result = await deleteCustomPage(storeId, owner.userId, page);
    if (!result.ok) return reply(result.status, result.body);
    const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { slug: true } });
    revalidateStorePageLayouts(storeId);
    if (store?.slug) revalidateStoreInfo(store.slug);
    return NextResponse.json({ deleted: page });
  } catch (error) {
    console.log("[PAGE_LAYOUT_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

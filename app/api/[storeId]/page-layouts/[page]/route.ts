import { NextResponse } from "next/server";

import { getUserId } from "@/lib/agent/context";
import { isPage, readLayout, saveLayout } from "@/lib/page-layouts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type Ctx = { params: Promise<{ storeId: string; page: string }> };

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Public: the store reads the layout of a page here (page = home, category or product). Null = none saved yet. */
export async function GET(_req: Request, { params }: Ctx) {
  const { storeId, page } = await params;
  if (!isPage(page)) return new NextResponse("Unknown page. Use home, category or product.", { status: 404 });
  const layout = await readLayout(storeId, page);
  if (layout === undefined) return new NextResponse("Store not found", { status: 404 });
  return NextResponse.json(layout, { headers: corsHeaders });
}

/** Owner only: replaces the whole layout of a page. Sections without an id get one. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { storeId, page } = await params;
    if (!isPage(page)) return new NextResponse("Unknown page. Use home, category or product.", { status: 404 });
    const userId = await getUserId();
    if (!userId) return new NextResponse("Unauthenticated", { status: 403 });

    const result = await saveLayout(storeId, userId, page, await req.json());
    if (!result.ok) {
      return typeof result.body === "string"
        ? new NextResponse(result.body, { status: result.status })
        : NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json(result.layout, { headers: corsHeaders });
  } catch (error) {
    console.log("[PAGE_LAYOUT_PUT]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

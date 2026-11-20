import { NextResponse } from "next/server";

import { getUserId } from "@/lib/agent/context";
import { PAGES } from "@/lib/home-layout";
import { createCustomPage, listCustomRoutes } from "@/lib/page-layouts";

type Ctx = { params: Promise<{ storeId: string }> };

/** The store's pages: the built-in ones and the routes of its custom pages. */
export async function GET(_req: Request, { params }: Ctx) {
  const { storeId } = await params;
  const custom = await listCustomRoutes(storeId);
  if (custom === undefined) return new NextResponse("Store not found", { status: 404 });
  return NextResponse.json({ pages: PAGES, custom });
}

/** Owner only: creates an empty custom page at { route }. 400 for a reserved or malformed route, 409 when it is taken. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const userId = await getUserId();
    if (!userId) return new NextResponse("Unauthenticated", { status: 403 });

    const body = await req.json().catch(() => null);
    const result = await createCustomPage(storeId, userId, body);
    if (!result.ok) {
      return typeof result.body === "string" ? new NextResponse(result.body, { status: result.status }) : NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json({ route: result.route, blocks: [] }, { status: 201 });
  } catch (error) {
    console.log("[PAGE_LAYOUTS_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

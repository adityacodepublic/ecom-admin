import { NextResponse } from "next/server";

import { GET as getPage, OPTIONS, PUT as putPage } from "@/app/api/[storeId]/page-layouts/[page]/route";

// The home page layout at its first address (kept so existing links and stores keep working).
// New code uses /page-layouts/home, /page-layouts/category and /page-layouts/product.

type Ctx = { params: Promise<{ storeId: string }> };
const home = async ({ params }: Ctx) => ({ params: params.then((p) => ({ ...p, page: "home" })) });

export { OPTIONS };
export const GET = async (req: Request, ctx: Ctx): Promise<NextResponse> => (await getPage(req, await home(ctx))) as NextResponse;
export const PUT = async (req: Request, ctx: Ctx): Promise<NextResponse> => (await putPage(req, await home(ctx))) as NextResponse;

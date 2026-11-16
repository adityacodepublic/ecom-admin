import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";
import { SLUG_TAKEN_MESSAGE, slugError } from "@/lib/slug";
import { normalizeSlug } from "@/lib/store-slug";

/**
 * GET /api/stores/slug-available?slug=...&storeId=...  (signed-in owners only)
 * A hint for the form while typing. The create/rename itself is decided by the unique index (409).
 * With storeId (rename), that store's own current slug counts as available.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Unauthenticated", { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const slug = normalizeSlug(searchParams.get("slug"));
  const storeId = searchParams.get("storeId");

  const invalid = slugError(slug);
  if (invalid) return NextResponse.json({ available: false, error: invalid });

  const owner = await prismadb.store.findUnique({ where: { slug }, select: { id: true, userId: true } });
  const ownCurrent = !!owner && owner.id === storeId && owner.userId === userId;
  if (owner && !ownCurrent) return NextResponse.json({ available: false, error: SLUG_TAKEN_MESSAGE });
  return NextResponse.json({ available: true });
}

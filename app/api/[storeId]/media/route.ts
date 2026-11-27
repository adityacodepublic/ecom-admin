import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { requireStoreOwnerResponse } from "@/lib/api/admin-auth";
import { getUsage } from "@/lib/media-usage";
import { cloudName, storeFolder } from "@/lib/cloudinary";
import { escapeLike, nameFromUrl, type MediaItem } from "@/lib/media";

const PAGE = 40;

// List the store's library: ?q=search&sort=newest|oldest|name&filter=all|unused&page=0
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const owner = await requireStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;

    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") || "").trim().slice(0, 100);
    const sort = sp.get("sort") || "newest";
    const unusedOnly = sp.get("filter") === "unused";
    const page = Math.max(0, parseInt(sp.get("page") || "0", 10) || 0);

    const search = q
      ? Prisma.sql`AND m."name" ILIKE ${"%" + escapeLike(q) + "%"} ESCAPE '\\'`
      : Prisma.empty;
    // "Unused" = the url is in no product image, category (thumbnail or billboard), page block, logo or product description of this store.
    const unused = unusedOnly
      ? Prisma.sql`
        AND NOT EXISTS (SELECT 1 FROM "Image" i JOIN "Product" p ON p."id" = i."productId"
                        WHERE p."storeId" = m."storeId" AND i."url" = m."url")
        AND NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."storeId" = m."storeId"
                        AND (c."imageUrl" = m."url" OR strpos(c."banner"::text, m."url") > 0))
        AND NOT EXISTS (SELECT 1 FROM "Store" s WHERE s."id" = m."storeId"
                        AND (strpos(COALESCE(s."pageLayouts"::text, ''), m."url") > 0
                          OR s."settings"->>'logo' = m."url"
                          OR s."settings"->>'favicon' = m."url"
                          OR strpos(COALESCE(s."settings"->>'navbarHtml', '') || COALESCE(s."settings"->>'footerHtml', ''), m."url") > 0))
        AND NOT EXISTS (SELECT 1 FROM "Product" p2 WHERE p2."storeId" = m."storeId"
                        AND p2."description" IS NOT NULL AND position(m."url" in p2."description") > 0)`
      : Prisma.empty;
    const order =
      sort === "oldest" ? Prisma.sql`m."createdAt" ASC, m."id"`
      : sort === "name" ? Prisma.sql`lower(m."name") ASC, m."id"`
      : Prisma.sql`m."createdAt" DESC, m."id"`;

    const rows = await prismadb.$queryRaw<
      { id: string; url: string; publicId: string | null; source: string; name: string; createdAt: Date }[]
    >(Prisma.sql`
      SELECT m."id", m."url", m."publicId", m."source", m."name", m."createdAt"
      FROM "MediaImage" m
      WHERE m."storeId" = ${storeId} ${search} ${unused}
      ORDER BY ${order}
      LIMIT ${PAGE + 1} OFFSET ${page * PAGE}`);

    const hasMore = rows.length > PAGE;
    const pageRows = rows.slice(0, PAGE);
    const usage = await getUsage(storeId, pageRows.map((r) => r.url));

    const items: MediaItem[] = pageRows.map((r) => ({
      id: r.id,
      url: r.url,
      publicId: r.publicId,
      source: r.source === "url" ? "url" : "upload",
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      usedIn: usage.get(r.url) ?? [],
    }));
    return NextResponse.json({ items, hasMore });
  } catch (error) {
    console.log("[MEDIA_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

// Add an image to the library: after a Cloudinary upload, or for a pasted link.
export async function POST(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const { storeId } = await params;
    const owner = await requireStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;

    const body = await req.json();
    const url = String(body.url || "");
    if (body.source !== "upload" && body.source !== "url") {
      return new NextResponse('source must be "upload" or "url"', { status: 400 });
    }
    const source: "upload" | "url" = body.source;
    let publicId: string | null = null;

    if (!/^https:\/\//.test(url) || url.length > 2000) {
      return new NextResponse("A valid https image link is required", { status: 400 });
    }

    if (source === "upload") {
      publicId = String(body.publicId || "");
      // A store can only register files from its own folder, in our own Cloudinary account.
      if (!publicId.startsWith(`${storeFolder(storeId)}/`)) {
        return new NextResponse("Image is not in this store's folder", { status: 400 });
      }
      if (!url.startsWith(`https://res.cloudinary.com/${cloudName()}/`) || !url.includes(publicId)) {
        return new NextResponse("Image link does not match the upload", { status: 400 });
      }
    }

    const name = String(body.name || nameFromUrl(url)).slice(0, 200);
    const row = await prismadb.mediaImage.upsert({
      where: { storeId_url: { storeId, url } },
      create: { storeId, url, publicId, source, name },
      update: {},
    });
    const item: MediaItem = {
      id: row.id,
      url: row.url,
      publicId: row.publicId,
      source: row.source === "url" ? "url" : "upload",
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      usedIn: [],
    };
    return NextResponse.json(item);
  } catch (error) {
    console.log("[MEDIA_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

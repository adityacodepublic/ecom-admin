import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { checkStoreOwner } from "@/lib/media-auth";
import { fileStillReferenced, getUsage } from "@/lib/media-usage";
import { destroyImage } from "@/lib/cloudinary";

// Delete an UNUSED image. Used images are refused with the list of places (409).
export async function DELETE(_req: Request, { params }: { params: Promise<{ storeId: string; mediaId: string }> }) {
  try {
    const { storeId, mediaId } = await params;
    const denied = await checkStoreOwner(storeId);
    if (denied) return denied;

    const media = await prismadb.mediaImage.findFirst({ where: { id: mediaId, storeId } });
    if (!media) return new NextResponse("Not found", { status: 404 });

    const usedIn = (await getUsage(storeId, [media.url])).get(media.url) ?? [];
    if (usedIn.length > 0) {
      return NextResponse.json({ error: "This image is still used", usedIn }, { status: 409 });
    }

    // Only a file we uploaded (source "upload" with a public id) is deleted in Cloudinary.
    // If Cloudinary fails, keep the row so we do not lose track of the file.
    // Also keep the file when anything in ANY other store still points at it (shared file).
    if (media.source === "upload" && media.publicId && !(await fileStillReferenced(prismadb, media))) {
      try {
        await destroyImage(media.publicId);
      } catch (e) {
        console.log("[MEDIA_DESTROY]", e);
        return NextResponse.json({ error: "Could not delete the file in Cloudinary. Try again." }, { status: 502 });
      }
    }
    await prismadb.mediaImage.deleteMany({ where: { id: mediaId, storeId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log("[MEDIA_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

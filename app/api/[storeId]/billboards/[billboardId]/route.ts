import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/agent/context";
import prismadb from "@/lib/prismadb";
import { checkImages, inUseResponse } from "@/lib/api/validate";

const corsHeaders = {
  "Access-Control-Allow-Origin": `*`,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ billboardId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    if (!resolvedParams.billboardId) {
      return new NextResponse("Billboard id is required", { status: 400 });
    }

    const billboard = await prismadb.billboard.findFirst({
      where: {
        id: resolvedParams.billboardId,
        storeId: resolvedParams.storeId,
      },
      select: {
        label: true,
        images: {
          select: {
            url: true,
            href: true,
            order: true,
          },
        },
      },
    });

    return NextResponse.json(billboard, { headers: corsHeaders });
  } catch (error) {
    console.log("[BILLBOARD_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ billboardId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const userId = await getUserId();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!resolvedParams.billboardId) {
      return new NextResponse("Billboard id is required", { status: 400 });
    }


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
      select: { id: true },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    // The record must belong to THIS store (ids alone are not enough).
    const inStore = await prismadb.billboard.findFirst({
      where: { id: resolvedParams.billboardId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    const billboard = await prismadb.billboard.delete({
      where: {
        id: resolvedParams.billboardId,
      },
      include: {
        categories: true,
      },
    });

    // const paths = billboard.categories.map((item)=>(`/category/${item.id}`));
    // if(paths && paths.length===0) {paths.push('/');}

    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(billboard, {
      headers: corsHeaders,
    });
  } catch (error) {
    const inUse = inUseResponse(
      error,
      "Make sure you removed all categories using this billboard first.",
      corsHeaders,
    );
    if (inUse) return inUse;
    console.log("[BILLBOARD_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ billboardId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const userId = await getUserId();

    const body = await req.json();

    const { label, images } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!label) {
      return new NextResponse("Label is required", { status: 400 });
    }

    const checkedImages = checkImages(images, { href: true });
    if (!checkedImages.ok) {
      return new NextResponse(checkedImages.error, { status: 400 });
    }

    if (!resolvedParams.billboardId) {
      return new NextResponse("Billboard id is required", { status: 400 });
    }


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: resolvedParams.storeId,
        userId,
      },
      select: { id: true },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    // The record must belong to THIS store (ids alone are not enough).
    const inStore = await prismadb.billboard.findFirst({
      where: { id: resolvedParams.billboardId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    // One transaction: label and images change together or not at all. The row lock makes concurrent edits
    // of the same billboard take turns (no duplicated images).
    const billboard = await prismadb.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Billboard" WHERE id = ${resolvedParams.billboardId} AND "storeId" = ${resolvedParams.storeId} FOR UPDATE`;
      if (locked.length === 0) return null;
      return tx.billboard.update({
        where: { id: resolvedParams.billboardId },
        data: {
          label,
          images: {
            deleteMany: {},
            createMany: {
              data: checkedImages.data.map((image) => ({ url: image.url, order: image.order, href: image.href ?? "" })),
            },
          },
        },
        include: { categories: true },
      });
    });
    if (!billboard) {
      return new NextResponse("Not found", { status: 404 });
    }

    const paths = billboard.categories.map((item) => `/category/${item.id}`);
    if (paths && paths.length === 0) {
      paths.push("/");
    }

    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(billboard, {
      headers: corsHeaders,
    });
  } catch (error) {
    console.log("[BILLBOARD_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

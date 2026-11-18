import { revalidateStoreCatalog } from "@/lib/store-revalidate";
import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { inUseResponse } from "@/lib/api/validate";
import { getUserId } from "@/lib/agent/context";
import { Prisma } from "@prisma/client";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filterId: string; storeId?: string }> },
) {
  try {
    const resolvedParams = await params;
    if (!resolvedParams.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    const filter = await prismadb.filter.findFirst({
      where: {
        id: resolvedParams.filterId,
        storeId: resolvedParams.storeId,
      },
      select: {
        id: true,
        name: true,
        value: {
          select: {
            id: true,
            value: true,
            unit: true,
          },
        },
      },
    });

    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    console.log("[FILTER_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ filterId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const userId = await getUserId();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!resolvedParams.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
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
    const inStore = await prismadb.filter.findFirst({
      where: { id: resolvedParams.filterId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }


    const filter = await prismadb.filter.delete({
      where: {
        id: resolvedParams.filterId,
      },
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    const inUse = inUseResponse(error, "Make sure you removed all products using this filter first.", corsHeaders);
    if (inUse) return inUse;
    console.log("[FILTER_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ filterId: string; storeId: string }> },
) {
  try {
    const resolvedParams = await params;
    const userId = await getUserId();

    const body = await req.json();

    const { name, value } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!value) {
      return new NextResponse("Value is required", { status: 400 });
    }

    if (!resolvedParams.filterId) {
      return new NextResponse("Filter id is required", { status: 400 });
    }

    if (!resolvedParams.storeId) {
      return new NextResponse("Filter id is required", { status: 400 });
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
    const inStore = await prismadb.filter.findFirst({
      where: { id: resolvedParams.filterId, storeId: resolvedParams.storeId },
      select: { id: true },
    });
    if (!inStore) {
      return new NextResponse("Not found", { status: 404 });
    }

    const duplicate = await prismadb.filter.findFirst({
      where: { storeId: resolvedParams.storeId, name, NOT: { id: resolvedParams.filterId } },
      select: { id: true },
    });
    if (duplicate) {
      return new NextResponse("A filter with this name already exists", { status: 409 });
    }

    if (!Array.isArray(value)) {
      return new NextResponse("Value is required", { status: 400 });
    }

    // Normalize the incoming values (value may be empty = no number; unit is text).
    let incoming: { id?: string; value: Prisma.Decimal | null; unit: string }[];
    try {
      incoming = value.map((v: { id?: unknown; value?: unknown; unit?: unknown }) => {
        if (typeof v?.unit !== "string") throw new Error("unit");
        const num = v.value === undefined || v.value === null || v.value === "" ? null : new Prisma.Decimal(v.value as Prisma.Decimal.Value);
        return { id: typeof v.id === "string" ? v.id : undefined, value: num, unit: v.unit };
      });
    } catch {
      return new NextResponse("Each value needs a numeric value (or none) and a unit", { status: 400 });
    }

    // A value's identity is its id: an id of this filter updates that row in place (products stay linked),
    // no id (or a foreign/duplicate id) creates a new row, rows not referenced are deleted.
    const filter = await prismadb.$transaction(async (tx) => {
      const existing = await tx.value.findMany({ where: { filterId: resolvedParams.filterId }, select: { id: true } });
      const own = new Set(existing.map((e) => e.id));
      const kept = new Set<string>();
      const toUpdate: { id: string; value: Prisma.Decimal | null; unit: string }[] = [];
      const toCreate: { filterId: string; value: Prisma.Decimal | null; unit: string }[] = [];

      for (const v of incoming) {
        if (v.id && own.has(v.id) && !kept.has(v.id)) {
          kept.add(v.id);
          toUpdate.push({ id: v.id, value: v.value, unit: v.unit });
        } else {
          toCreate.push({ filterId: resolvedParams.filterId, value: v.value, unit: v.unit });
        }
      }

      const dropped = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
      if (dropped.length) await tx.value.deleteMany({ where: { id: { in: dropped } } });
      for (const u of toUpdate) {
        await tx.value.update({ where: { id: u.id }, data: { value: u.value, unit: u.unit } });
      }
      if (toCreate.length) await tx.value.createMany({ data: toCreate });

      return tx.filter.update({ where: { id: resolvedParams.filterId }, data: { name } });
    });


    revalidateStoreCatalog(resolvedParams.storeId);
    return NextResponse.json(filter, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new NextResponse("A filter with this name already exists", { status: 409 });
    }
    console.log("[FILTER_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

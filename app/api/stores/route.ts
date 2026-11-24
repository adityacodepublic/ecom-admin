import { NextResponse } from "next/server";

import { requireSessionUserResponse } from "@/lib/api/admin-auth";
import { createStore } from "@/lib/store-slug";

export async function POST(req: Request) {
  try {
    const session = await requireSessionUserResponse();
    if ("error" in session) return session.error;

    const body = await req.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    // The slug is the owner's choice, used as typed. 400 = not allowed, 409 = taken. Never auto-changed.
    const result = await createStore(name, session.userId, body?.slug);
    if (!result.ok) {
      return NextResponse.json({ field: "slug", error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value);
  } catch (error) {
    console.log("[STORES_POST]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

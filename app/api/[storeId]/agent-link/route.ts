import { ownerOrError } from "@/lib/agent/owner";
import { fail, send } from "@/lib/agent/proxy";
import { createLink, deleteLink, readAccess } from "@/lib/agent/store";

type Ctx = { params: Promise<{ storeId: string }> };

// Owner only (Clerk). The token is never returned here, except once by POST.
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    const a = await readAccess(storeId);
    return send({
      exists: !!a.link,
      mode: a.link?.mode ?? null,
      createdAt: a.link?.createdAt ?? null,
      log: a.link ? [...a.log].reverse() : [], // newest first
    });
  } catch (error) {
    console.log("[AGENT_LINK_GET]", error);
    return fail(500, "Something went wrong");
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    const body = await req.json().catch(() => ({}));
    if (body?.mode !== "full" && body?.mode !== "permission") return fail(400, 'mode must be "full" or "permission"');
    const token = await createLink(storeId, body.mode);
    return send({ url: `${new URL(req.url).origin}/api/agent/${token}`, mode: body.mode });
  } catch (error) {
    console.log("[AGENT_LINK_POST]", error);
    return fail(500, "Something went wrong");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    await deleteLink(storeId);
    return send({ ok: true });
  } catch (error) {
    console.log("[AGENT_LINK_DELETE]", error);
    return fail(500, "Something went wrong");
  }
}

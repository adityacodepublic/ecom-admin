import { decideRequest, getRequest } from "@/lib/agent/decide";
import { ownerOrError } from "@/lib/agent/owner";
import { fail, send } from "@/lib/agent/proxy";

type Ctx = { params: Promise<{ storeId: string; id: string }> };

// Owner only (Clerk). What the agent asked for, so the owner can decide.
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { storeId, id } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    const r = await getRequest(storeId, id);
    if (!r) return fail(404, "Request expired or unknown");
    return send({
      id: r.id,
      method: r.method,
      path: r.path,
      query: r.query,
      body: r.body,
      status: r.status,
      createdAt: r.createdAt,
      ...(r.decidedAt ? { decidedAt: r.decidedAt } : {}),
      ...(r.result ? { result: r.result } : {}),
    });
  } catch (error) {
    console.log("[AGENT_REQUEST_GET]", error);
    return fail(500, "Something went wrong");
  }
}

// body { decision: "allow" | "deny" }
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { storeId, id } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    const body = await req.json().catch(() => ({}));
    if (body?.decision !== "allow" && body?.decision !== "deny") return fail(400, 'decision must be "allow" or "deny"');
    const out = await decideRequest(storeId, o.userId, id, body.decision);
    if (!out.ok) return fail(out.status, out.error);
    const r = out.request;
    return send({ id: r.id, status: r.status, ...(r.result ? { result: r.result } : {}) });
  } catch (error) {
    console.log("[AGENT_REQUEST_POST]", error);
    return fail(500, "Something went wrong");
  }
}

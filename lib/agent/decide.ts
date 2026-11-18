import { executeRequest, storableResult } from "@/lib/agent/routes";
import { mutateAccess, readAccess, type AgentRequest } from "@/lib/agent/store";

export type Decision = "allow" | "deny";

export type DecideOutcome =
  | { ok: true; request: AgentRequest }
  | { ok: false; status: 404 | 409; error: string };

/** One request of this store (null if unknown or expired: pending 30 min after creation, decided 30 min after the decision). */
export async function getRequest(storeId: string, id: string): Promise<AgentRequest | null> {
  return (await readAccess(storeId)).requests.find((r) => r.id === id) ?? null;
}

/**
 * The owner decides on a pending request. "allow" runs it through the same executor the proxy uses, as the
 * store owner, and stores the (truncated) result. The pending -> approved flip happens under a row lock BEFORE
 * running, so a double click cannot run it twice.
 */
export async function decideRequest(
  storeId: string,
  ownerId: string,
  id: string,
  decision: Decision,
): Promise<DecideOutcome> {
  type Claim = { request: AgentRequest } | { error: string; status: 404 | 409 };
  const claimed = await mutateAccess<Claim>(storeId, (a) => {
    const r = a.requests.find((x) => x.id === id);
    if (!r) return { error: "Request expired or unknown", status: 404 as const };
    if (r.status !== "pending") return { error: `Already ${r.status}`, status: 409 as const };
    r.status = decision === "allow" ? "approved" : "denied";
    r.decidedAt = new Date().toISOString();
    return { request: { ...r } };
  });
  if (!("request" in claimed)) return { ok: false, status: claimed.status, error: claimed.error };
  if (decision === "deny") return { ok: true, request: claimed.request };

  const r = claimed.request;
  let result;
  try {
    result = await executeRequest({
      userId: ownerId,
      storeId,
      method: r.method,
      segments: r.path.split("/").filter(Boolean),
      query: r.query,
      body: r.body ?? undefined,
    });
  } catch (error) {
    console.log("[AGENT_EXECUTE]", error);
    result = { status: 500, body: { error: "Something went wrong" } };
  }
  const stored = storableResult(result);
  const final = await mutateAccess(storeId, (a) => {
    const x = a.requests.find((q) => q.id === id);
    if (!x) return { ...r, result: stored };
    x.result = stored;
    x.status = stored.status < 400 ? "approved" : "failed";
    return { ...x };
  });
  return { ok: true, request: final };
}

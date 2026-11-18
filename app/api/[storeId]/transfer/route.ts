import { currentUser } from "@clerk/nextjs/server";

import { ownerOrError } from "@/lib/agent/owner";
import { fail, send } from "@/lib/agent/proxy";
import { cancelTransfer, createTransfer, isEmail, normalizeEmail, readPending } from "@/lib/transfer";

type Ctx = { params: Promise<{ storeId: string }> };

// Owner only (Clerk session). Not on the agent allowlist, so an agent can never hand a store over.
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    const p = await readPending(storeId);
    return send({ pending: !!p, email: p?.email ?? null, createdAt: p?.createdAt ?? null, expired: p?.expired ?? false });
  } catch (error) {
    console.log("[TRANSFER_GET]", error);
    return fail(500, "Something went wrong");
  }
}

/** Starts a hand-over to one email. Returns the link to send. Replaces any earlier pending link. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (!isEmail(email)) return fail(400, "Enter a valid email address");
    const me = await currentUser();
    if (me?.emailAddresses.some((e) => normalizeEmail(e.emailAddress) === email)) return fail(400, "That is your own email");
    const token = await createTransfer(storeId, email);
    return send({ url: `${new URL(req.url).origin}/transfer/${storeId}/${token}`, email });
  } catch (error) {
    console.log("[TRANSFER_POST]", error);
    return fail(500, "Something went wrong");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const o = await ownerOrError(storeId);
    if ("error" in o) return o.error;
    await cancelTransfer(storeId);
    return send({ ok: true });
  } catch (error) {
    console.log("[TRANSFER_DELETE]", error);
    return fail(500, "Something went wrong");
  }
}

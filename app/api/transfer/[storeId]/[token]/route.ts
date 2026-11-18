import { auth, currentUser } from "@clerk/nextjs/server";

import { fail, send } from "@/lib/agent/proxy";
import { acceptTransfer } from "@/lib/transfer";

type Ctx = { params: Promise<{ storeId: string; token: string }> };

const REASON_TEXT = {
  invalid: "This link is no longer valid.",
  expired: "This link has expired. Ask the owner for a new one.",
  wrong_account: "This store was offered to a different email address. Sign in with that email to accept it.",
  already_owner: "This store is already yours.",
} as const;

/** The recipient accepts: becomes the owner of this one store. Needs a signed-in user whose verified email was invited. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { storeId, token } = await params;
    const { userId } = await auth();
    if (!userId) return fail(401, "Sign in first");
    const user = await currentUser();
    const verified = (user?.emailAddresses ?? []).filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
    const result = await acceptTransfer(storeId, token, userId, verified);
    if (!result.ok) return fail(result.reason === "wrong_account" ? 403 : 400, REASON_TEXT[result.reason]);
    return send({ ok: true, storeId });
  } catch (error) {
    console.log("[TRANSFER_ACCEPT]", error);
    return fail(500, "Something went wrong");
  }
}

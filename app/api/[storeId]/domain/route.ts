import { NextResponse } from "next/server";

import { requireSessionStoreOwnerResponse } from "@/lib/api/admin-auth";
import { clearStoreDomain, getStoreDomain, setStoreDomain, type DomainResult } from "@/lib/store-domain";

// The store's custom domain (Settings > Custom domain). Owner's browser session only, like the slug route:
// a domain change rebuilds the storefront, so the agent API cannot make it.

const NO_STORE = { "Cache-Control": "no-store" };

function respond(result: DomainResult) {
  if (result.ok) return NextResponse.json({ customDomain: result.customDomain, verified: result.verified, status: result.status }, { headers: NO_STORE });
  const headers: Record<string, string> = { ...NO_STORE };
  if (result.retryAfterSeconds) headers["Retry-After"] = String(result.retryAfterSeconds);
  return NextResponse.json({ error: result.error }, { status: result.status, headers });
}

type Ctx = { params: Promise<{ storeId: string }> };

/** { customDomain, verified, status }: status is the live Vercel state and the DNS records to set. ?verify=1 re-checks the TXT challenge. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const owner = await requireSessionStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;
    const verify = new URL(req.url).searchParams.get("verify") === "1";
    return respond(await getStoreDomain(storeId, owner.userId, { verify }));
  } catch (error) {
    console.log("[STORE_DOMAIN_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

/** Body { domain }. 400 = not a usable domain, 409 = used by another store or Vercel project, 429 = changed a moment ago. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const owner = await requireSessionStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;
    const body = await req.json().catch(() => null);
    return respond(await setStoreDomain(storeId, owner.userId, body?.domain));
  } catch (error) {
    console.log("[STORE_DOMAIN_PUT]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { storeId } = await params;
    const owner = await requireSessionStoreOwnerResponse(storeId);
    if ("error" in owner) return owner.error;
    return respond(await clearStoreDomain(storeId, owner.userId));
  } catch (error) {
    console.log("[STORE_DOMAIN_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

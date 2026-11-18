import { handleProxy } from "@/lib/agent/proxy";

export const runtime = "nodejs";

// The proxy: {base}/products, {base}/products/{id}, ... See lib/agent/routes.ts for what is reachable.
type Ctx = { params: Promise<{ token: string; path: string[] }> };

async function run(req: Request, { params }: Ctx) {
  const { token, path } = await params;
  return handleProxy(req, token, path);
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;

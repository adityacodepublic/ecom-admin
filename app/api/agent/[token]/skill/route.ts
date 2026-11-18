import { authenticate, baseUrl, fail } from "@/lib/agent/proxy";
import { readSkill } from "@/lib/agent/skills";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

// The router skill. The token must be valid, like every agent call.
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!(await authenticate(token))) return fail(401, "This link is invalid or was deleted");
  const text = await readSkill("index", baseUrl(req, token));
  if (text === null) return fail(404, "Skill not found");
  return new Response(text, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" } });
}

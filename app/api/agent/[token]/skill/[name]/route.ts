import { authenticate, baseUrl, fail } from "@/lib/agent/proxy";
import { readSkill } from "@/lib/agent/skills";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string; name: string }> };

// A feature skill: agent-skills/{name}.md
export async function GET(req: Request, { params }: Ctx) {
  const { token, name } = await params;
  if (!(await authenticate(token))) return fail(401, "This link is invalid or was deleted");
  const text = await readSkill(name, baseUrl(req, token));
  if (text === null) return fail(404, "Skill not found");
  return new Response(text, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" } });
}

import { handleRequestStatus } from "@/lib/agent/proxy";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  return handleRequestStatus(token, id);
}

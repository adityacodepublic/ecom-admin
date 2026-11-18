import { handleUploadUrl } from "@/lib/agent/proxy";

export const runtime = "nodejs";

// Presigned direct-to-Cloudinary upload (max 6 MB). Runs in both modes: signing changes nothing by itself.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handleUploadUrl(req, token);
}

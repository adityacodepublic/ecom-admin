import { NextResponse } from "next/server";

import { WRITE_METHODS, executeRequest, resolveRoute } from "@/lib/agent/routes";
import { checkUploadedImage, createUploadUrl } from "@/lib/agent/upload-url";
import {
  MAX_REQUESTS_BYTES,
  appendLog,
  findByToken,
  mutateAccess,
  readAccess,
  type AgentRequest,
} from "@/lib/agent/store";
import { newRequestId } from "@/lib/agent/token";

export const MAX_BODY_BYTES = 200_000;
/** Vercel caps responses at 4.5 MB; refuse anything bigger than this (serialized) before it gets that far. */
export const MAX_RESPONSE_BYTES = 3_500_000;

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function send(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** {origin}/api/agent/{token} */
export const baseUrl = (req: Request, token: string) => `${new URL(req.url).origin}/api/agent/${token}`;

/** Token in the URL -> the store it belongs to, or null. */
export const authenticate = (token: string) => findByToken(token);

/** Handles ANY {base}/{path...} call. */
export async function handleProxy(req: Request, token: string, segments: string[]) {
  const access = await authenticate(token);
  if (!access) return fail(401, "This link is invalid or was deleted");
  const { storeId, userId, mode } = access;
  const method = req.method.toUpperCase();
  const path = "/" + segments.join("/");
  const query = new URL(req.url).search.replace(/^\?/, "");
  const log = (status: number, outcome: "ok" | "error" | "blocked" | "pending") =>
    appendLog(storeId, { method, path, status, outcome }).catch(() => undefined);

  try {
    const resolved = resolveRoute(method, segments);
    if (!resolved.ok) {
      await log(resolved.status, resolved.status === 404 ? "error" : "blocked");
      return fail(resolved.status, resolved.error);
    }

    let body: unknown;
    if (WRITE_METHODS.has(method)) {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) {
        await log(413, "error");
        return fail(413, "Body is too large");
      }
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          await log(400, "error");
          return fail(400, "The body must be JSON");
        }
      }
    }

    // Registering an image that was uploaded through upload-url only adds to the library: it runs at once in both
    // modes, after its real size is checked (6 MB). Links (source "url") are normal writes.
    const isUploadRegistration =
      method === "POST" && segments.length === 1 && segments[0] === "media" && (body as { source?: unknown } | undefined)?.source === "upload";
    if (isUploadRegistration) {
      const checked = await checkUploadedImage(storeId, body);
      if (!checked.ok) {
        await log(checked.status, "error");
        return fail(checked.status, checked.error);
      }
    }

    // Permission mode: writes wait for the owner.
    if (mode === "permission" && WRITE_METHODS.has(method) && !isUploadRegistration) {
      const id = newRequestId();
      const stored = await mutateAccess(storeId, (a) => {
        if (!a.link) return false;
        const r: AgentRequest = {
          id,
          method,
          path,
          query,
          body: body ?? null,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        // No count cap (bulk imports), only a size cap on everything stored.
        const size = Buffer.byteLength(JSON.stringify(a.requests)) + Buffer.byteLength(JSON.stringify(r));
        if (size > MAX_REQUESTS_BYTES) return null;
        a.requests.push(r);
        a.log.push({ at: r.createdAt, method, path, status: 202, outcome: "pending" });
        return true;
      });
      if (stored === false) return fail(401, "This link is invalid or was deleted");
      if (stored === null) {
        await log(413, "error");
        return fail(
          413,
          "Too much is waiting for the owner (size limit of 2 MB). Wait for the owner to decide on the pending requests, or for older requests to expire (30 minutes), then try again.",
        );
      }
      return send(
        {
          requestId: id,
          status: "pending",
          approveUrl: `${new URL(req.url).origin}/${storeId}/agent-requests/${id}`,
          expiresInMinutes: 30,
          message:
            `Not done yet. The store owner must approve this change. Ask them to open approveUrl and tell you when they decided, then check GET ${baseUrl(req, token)}/requests/${id}.`,
        },
        202,
      );
    }

    const result = await executeRequest({ userId, storeId, method, segments, query, body });
    // Vercel caps a response at 4.5 MB: refuse big GET answers instead of failing in transit. (Only GET: a write
    // has already run, and its answer is small.)
    const text = JSON.stringify(result.body ?? null);
    if (method === "GET" && text.length > MAX_RESPONSE_BYTES) {
      await log(413, "error");
      return fail(413, "Response too large. Use ?page=1&pageSize=50");
    }
    // Successful reads are not logged (a log write locks the store row). Writes and errors are.
    if (method !== "GET" || result.status >= 400) await log(result.status, result.status < 400 ? "ok" : "error");
    return new Response(text, {
      status: result.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.log("[AGENT_PROXY]", error);
    await log(500, "error");
    return fail(500, "Something went wrong");
  }
}

/** POST {base}/upload-url: presigned direct-to-Cloudinary upload data. Both modes, no approval. */
export async function handleUploadUrl(req: Request, token: string) {
  const access = await authenticate(token);
  if (!access) return fail(401, "This link is invalid or was deleted");
  try {
    const out = createUploadUrl(access.storeId, baseUrl(req, token));
    await appendLog(access.storeId, { method: "POST", path: "/upload-url", status: 200, outcome: "ok" });
    return send(out);
  } catch (error) {
    console.log("[AGENT_UPLOAD_URL]", error);
    await appendLog(access.storeId, { method: "POST", path: "/upload-url", status: 500, outcome: "error" });
    return fail(500, "Something went wrong");
  }
}

/** GET {base}/requests/{id} */
export async function handleRequestStatus(token: string, id: string) {
  const access = await authenticate(token);
  if (!access) return fail(401, "This link is invalid or was deleted");
  const found = (await readAccess(access.storeId)).requests.find((r) => r.id === id);
  if (!found) return fail(404, "Request expired or unknown");
  const out: { id: string; status: string; result?: unknown } = { id: found.id, status: found.status };
  if (found.status !== "pending" && found.result) out.result = found.result;
  return send(out);
}

import { agentContext } from "@/lib/agent/context";
import { truncateResult } from "@/lib/agent/store";

/**
 * What an agent may reach, and how a path is run. Hand-maintained on purpose: a new admin route is NOT
 * reachable by agents until it is added here.
 *
 * Paths mirror the admin API minus /api/{storeId}. The storeId is never taken from the agent: the executor
 * always puts the token's own store in.
 */

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Mod = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

type Route = {
  /** Path pieces. ":name" is a parameter (name = the param name in the existing route). */
  pattern: string[];
  load: () => Promise<unknown>;
  /** If set, only these methods are allowed (others -> blocked). */
  only?: string[];
};

// Order matters: static pieces before parameters (orders/stats before orders/:orderId).
const ROUTES: Route[] = [
  { pattern: ["categories"], load: () => import("@/app/api/[storeId]/categories/route") },
  { pattern: ["categories", ":categoryId"], load: () => import("@/app/api/[storeId]/categories/[categoryId]/route") },
  { pattern: ["products"], load: () => import("@/app/api/[storeId]/products/route") },
  { pattern: ["products", ":productId"], load: () => import("@/app/api/[storeId]/products/[productId]/route") },
  { pattern: ["filters"], load: () => import("@/app/api/[storeId]/filters/route") },
  { pattern: ["filters", ":filterId"], load: () => import("@/app/api/[storeId]/filters/[filterId]/route") },
  { pattern: ["page-layouts", "data"], load: () => import("@/app/api/[storeId]/page-layouts/data/route"), only: ["GET"] },
  { pattern: ["page-layouts", ":page"], load: () => import("@/app/api/[storeId]/page-layouts/[page]/route") },
  { pattern: ["orders"], load: () => import("@/app/api/[storeId]/orders/route") },
  { pattern: ["orders", "stats"], load: () => import("@/app/api/[storeId]/orders/stats/route") },
  { pattern: ["orders", ":orderId"], load: () => import("@/app/api/[storeId]/orders/[orderId]/route") },
  { pattern: ["order-settings"], load: () => import("@/app/api/[storeId]/order-settings/route") },
  { pattern: ["contact"], load: () => import("@/app/api/[storeId]/contact/route") },
  { pattern: ["branding"], load: () => import("@/app/api/[storeId]/branding/route") },
  { pattern: ["media"], load: () => import("@/app/api/[storeId]/media/route") },
  { pattern: ["media", ":mediaId"], load: () => import("@/app/api/[storeId]/media/[mediaId]/route") },
  { pattern: ["users"], load: () => import("@/app/api/[storeId]/users/route"), only: ["GET"] },
  { pattern: ["users", ":usersId"], load: () => import("@/app/api/[storeId]/users/[usersId]/route"), only: ["GET"] },
];

/** First path pieces an agent may never touch (also covers anything not in the table). */
const BLOCKED_FIRST = new Set(["stores", "agent-link", "agent-requests", "customer", "webhook"]);
/** Handled by the agent routes themselves, never proxied. */
export const RESERVED_FIRST = new Set(["skill", "upload-url", "requests"]);

export const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const READ_METHODS = new Set(["GET"]);

export type Resolved =
  | { ok: true; route: Route; params: Record<string, string> }
  | { ok: false; status: 403 | 404 | 405; error: string };

/** Checks a path + method against the allow/deny rules and finds the route. No side effects. */
export function resolveRoute(method: string, segments: string[]): Resolved {
  if (segments.length === 0 || segments.some((s) => !s || s === "." || s === ".." || /[\\/]/.test(s))) {
    return { ok: false, status: 404, error: "Unknown path" };
  }
  const first = segments[0];
  if (BLOCKED_FIRST.has(first) || RESERVED_FIRST.has(first) || (first === "media" && segments[1] === "sign")) {
    return { ok: false, status: 403, error: `Agents cannot use "${segments.join("/")}"` };
  }
  // Agents often guess these. There is no file upload or import endpoint on this server.
  if (first === "media" && segments.length === 2 && ["upload", "import"].includes(segments[1])) {
    return {
      ok: false,
      status: 404,
      error: `No "${segments.join("/")}" endpoint. Images are not sent to this server: call POST /upload-url, upload the file to the returned Cloudinary uploadUrl, then register it with POST /media. Read GET /skill/media.`,
    };
  }
  if (!READ_METHODS.has(method) && !WRITE_METHODS.has(method)) {
    return { ok: false, status: 405, error: `Method ${method} is not supported` };
  }
  for (const route of ROUTES) {
    if (route.pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const match = route.pattern.every((p, i) => {
      if (p.startsWith(":")) {
        params[p.slice(1)] = segments[i];
        return true;
      }
      return p === segments[i];
    });
    if (!match) continue;
    if (route.only && !route.only.includes(method)) {
      return { ok: false, status: 403, error: `Agents may only ${route.only.join("/")} "${segments.join("/")}"` };
    }
    return { ok: true, route, params };
  }
  return { ok: false, status: 404, error: `Unknown path "${segments.join("/")}"` };
}

export type ExecResult = { status: number; body: unknown };

/**
 * Runs one admin route in-process as the store owner (no HTTP hop, no secrets). The storeId is forced.
 * Returns the route's own status and body. Errors that are plain text become { error }.
 */
export async function executeRequest(input: {
  userId: string;
  storeId: string;
  method: string;
  segments: string[];
  query: string; // without "?"
  body?: unknown;
}): Promise<ExecResult> {
  const { userId, storeId, method, segments, query, body } = input;
  const resolved = resolveRoute(method, segments);
  if (!resolved.ok) return { status: resolved.status, body: { error: resolved.error } };

  const mod = (await resolved.route.load()) as Mod;
  const handler = mod[method as keyof Mod];
  if (typeof handler !== "function") return { status: 405, body: { error: `Method ${method} is not supported here` } };

  const url = `http://agent.internal/api/${storeId}/${segments.map(encodeURIComponent).join("/")}${query ? `?${query}` : ""}`;
  // Routes read JSON themselves; an empty body would crash them with a 500, so send {} and let them answer 400.
  const hasBody = WRITE_METHODS.has(method) && (body !== undefined || method !== "DELETE");
  const req = new Request(url, {
    method,
    headers: hasBody ? { "content-type": "application/json" } : {},
    body: hasBody ? JSON.stringify(body ?? {}) : undefined,
  });
  // storeId comes from the token, never from the agent's path.
  const params = Promise.resolve({ ...resolved.params, storeId });

  const res = await agentContext.run({ userId, storeId }, () => handler(req, { params }));
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = res.status >= 400 ? { error: text } : { message: text };
    }
  }
  return { status: res.status, body: parsed };
}

/** The stored form of a result (body truncated to ~10KB). */
export const storableResult = (r: ExecResult): ExecResult => ({ status: r.status, body: truncateResult(r.body) });

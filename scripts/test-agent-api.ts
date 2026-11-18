/**
 * Proves the agent API on the LOCAL database: token hashing/lookup, 30-minute pruning, blocked paths,
 * permission-mode flow (pending / approve / deny / expired), full-mode execution, cross-store isolation,
 * and "deleting the link kills access". Cloudinary is replaced by a fake fetch for the upload check.
 * It creates throw-away stores (slug zz-agent-test-*) and removes everything it created at the end.
 *
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-agent-api.ts
 */
import prismadb from "@/lib/prismadb";
import { Prisma } from "@prisma/client";
import { createToken, hashToken } from "@/lib/agent/token";
import {
  MAX_LOG,
  appendLog,
  createLink,
  deleteLink,
  findByToken,
  mutateAccess,
  prune,
  readAccess,
  type AgentAccess,
  type AgentRequest,
} from "@/lib/agent/store";
import { handleProxy, handleRequestStatus, handleUploadUrl } from "@/lib/agent/proxy";
import { decideRequest } from "@/lib/agent/decide";
import { resolveRoute } from "@/lib/agent/routes";
import { readSkill } from "@/lib/agent/skills";

process.env.CLOUDINARY_URL = "cloudinary://key:secret@testcloud";
let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
}

const TAG = `zz-agent-test-${Date.now()}`;
const OWNER_A = "zz-agent-owner-a";
const OWNER_B = "zz-agent-owner-b";
const createdStores: string[] = [];

async function makeStore(name: string, owner: string) {
  const store = await prismadb.store.create({ data: { name, userId: owner, slug: `${TAG}-${name}`.toLowerCase() } });
  createdStores.push(store.id);
  const billboard = await prismadb.billboard.create({ data: { storeId: store.id, label: `bb-${name}` } });
  const category = await prismadb.category.create({
    data: { storeId: store.id, billboardId: billboard.id, name: `cat-${name}`, imageUrl: "https://x.test/c.png" },
  });
  const product = await prismadb.product.create({
    data: { storeId: store.id, categoryId: category.id, name: `prod-${name}`, price: "10.00", quantity: 5, maxQuantity: 5 },
  });
  const filter = await prismadb.filter.create({ data: { storeId: store.id, name: `${TAG}-filter-${name}` } });
  return { store, billboard, category, product, filter };
}

type Res = { status: number; body: any };
/** Calls the real proxy handler the way the route file does. */
async function proxy(token: string, method: string, path: string, body?: unknown): Promise<Res> {
  const [p, qs] = path.split("?");
  const segments = p.split("/").filter(Boolean);
  const req = new Request(`http://localhost:3000/api/agent/${token}/${p}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handleProxy(req, token, segments);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function status(token: string, id: string): Promise<Res> {
  const res = await handleRequestStatus(token, id);
  return { status: res.status, body: await res.json() };
}

const exists = {
  billboard: async (id: string) => !!(await prismadb.billboard.findUnique({ where: { id } })),
  product: async (id: string) => !!(await prismadb.product.findUnique({ where: { id } })),
  category: async (id: string) => !!(await prismadb.category.findUnique({ where: { id } })),
  filter: async (id: string) => !!(await prismadb.filter.findUnique({ where: { id } })),
};

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  console.log(`Database host: ${new URL(url).host}`);

  const A = await makeStore("A", OWNER_A);
  const B = await makeStore("B", OWNER_B);

  // ------------------------------------------------------------ 1. token
  const t1 = createToken();
  check("token: 43 url-safe chars", /^[A-Za-z0-9_-]{43}$/.test(t1), t1);
  check("token: hash is sha256 hex and differs from the token", /^[0-9a-f]{64}$/.test(hashToken(t1)) && hashToken(t1) !== t1);
  const tokenA = await createLink(A.store.id, "full");
  const rawRow = await prismadb.store.findUniqueOrThrow({ where: { id: A.store.id }, select: { agentAccess: true } });
  const rawText = JSON.stringify(rawRow.agentAccess);
  check("token: only the hash is stored", !rawText.includes(tokenA) && rawText.includes(hashToken(tokenA)));
  const found = await findByToken(tokenA);
  check("token: lookup finds the store, its owner and the mode", found?.storeId === A.store.id && found.userId === OWNER_A && found.mode === "full", found);
  check("token: wrong token -> null", (await findByToken(createToken())) === null && (await findByToken("short")) === null);

  // ------------------------------------------------------------ 2. pruning
  const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  const fresh = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const sample: AgentAccess = {
    link: { tokenHash: "h", mode: "full", createdAt: old }, // the link itself is never pruned
    requests: [
      { id: "old", method: "POST", path: "/x", query: "", body: null, status: "pending", createdAt: old },
      { id: "new", method: "POST", path: "/x", query: "", body: null, status: "pending", createdAt: fresh },
    ],
    log: [
      { at: old, method: "GET", path: "/x", status: 200, outcome: "ok" },
      ...Array.from({ length: 60 }, (_, i) => ({ at: fresh, method: "GET", path: `/p${i}`, status: 200, outcome: "ok" as const })),
    ],
  };
  const pruned = prune(sample);
  check("prune: >30 min requests and log entries dropped", pruned.requests.length === 1 && pruned.requests[0].id === "new" && !pruned.log.some((l) => l.at === old));
  check("prune: log trimmed to the newest 50", pruned.log.length === MAX_LOG && pruned.log[MAX_LOG - 1].path === "/p59");
  check("prune: link is kept", pruned.link?.createdAt === old);
  const rq = (id: string, status: AgentRequest["status"], createdAt: string, decidedAt?: string, result?: AgentRequest["result"]): AgentRequest => ({
    id, method: "POST", path: "/x", query: "", body: null, status, createdAt, decidedAt, result,
  });
  const lifetime = prune({
    link: null,
    log: [],
    requests: [
      rq("decided-recent", "approved", old, fresh, { status: 200, body: {} }), // created long ago, decided 5 min ago -> kept
      rq("decided-old", "failed", fresh, old, { status: 500, body: {} }), // decided 31 min ago -> dropped
      rq("denied-old", "denied", fresh, old), // dropped
      rq("denied-recent", "denied", old, fresh), // kept
      rq("executing", "approved", old, old), // no result yet: never pruned mid-flight
      rq("pending-old", "pending", old), // dropped
    ],
  }).requests.map((r) => r.id).sort();
  check("prune: decided requests live 30 min from decidedAt, pending from createdAt, executing kept", JSON.stringify(lifetime) === JSON.stringify(["decided-recent", "denied-recent", "executing"]), lifetime);
  // in the database: seed old entries directly, then read
  await prismadb.store.update({
    where: { id: A.store.id },
    data: { agentAccess: { ...(rawRow.agentAccess as object), requests: sample.requests, log: sample.log } as Prisma.InputJsonValue },
  });
  const read = await readAccess(A.store.id);
  check("prune: readAccess prunes", read.requests.length === 1 && read.log.length === MAX_LOG);
  const after = (await prismadb.store.findUniqueOrThrow({ where: { id: A.store.id }, select: { agentAccess: true } })).agentAccess as any;
  check("prune: pruning is saved to the database", after.requests.length === 1 && after.log.length === MAX_LOG);
  await mutateAccess(A.store.id, (a) => {
    a.requests = [];
    a.log = [];
  });

  // ------------------------------------------------------------ 3. blocked paths + rules
  for (const [m, p] of [
    ["GET", "stores"],
    ["PATCH", `stores/${A.store.id}`],
    ["DELETE", `stores/${A.store.id}/slug`],
    ["GET", "customer/me"],
    ["GET", "customer/orders"],
    ["POST", "webhook"],
    ["GET", "agent-link"],
    ["POST", "agent-requests/abc"],
    ["POST", "media/sign"],
    ["POST", "users"],
    ["DELETE", "users/abc"],
  ] as const) {
    const r = await proxy(tokenA, m, p, m === "GET" ? undefined : {});
    check(`blocked: ${m} /${p} -> 403 {error}`, r.status === 403 && typeof r.body?.error === "string", r);
  }
  for (const p of ["nope", "products/a/b/c", "orders/x/y", `${A.store.id}/products`]) {
    const r = await proxy(tokenA, "GET", p);
    check(`unknown: /${p} -> 404 {error}`, r.status === 404 && typeof r.body?.error === "string", r);
  }
  check("rules: ../ and encoded slashes are not routable", resolveRoute("GET", ["products", ".."]).ok === false && resolveRoute("GET", ["products", "a/b"]).ok === false);
  check("rules: allowed paths resolve", ["billboards", "orders", "order-settings", "contact", "home-layout", "media", "users"].every((s) => resolveRoute("GET", [s]).ok) && resolveRoute("GET", ["orders", "stats"]).ok);
  check("rules: bad token -> 401", (await proxy(createToken(), "GET", "products")).status === 401);
  const log1 = (await readAccess(A.store.id)).log;
  check("log: blocked calls are logged as blocked", log1.some((l) => l.path === "/customer/me" && l.outcome === "blocked"));

  // ------------------------------------------------------------ 4. full mode
  let r = await proxy(tokenA, "GET", "products");
  check("full: GET /products lists", r.status === 200 && r.body.some((p: any) => p.id === A.product.id), r.status);
  r = await proxy(tokenA, "POST", "billboards", { label: "Agent BB", images: [{ url: "https://x.test/b.png", order: 1 }] });
  check("full: POST /billboards runs at once", r.status === 200 && (await prismadb.billboard.count({ where: { storeId: A.store.id, label: "Agent BB" } })) === 1, r);
  const bbId = r.body?.id;
  r = await proxy(tokenA, "PATCH", `billboards/${bbId}`, { label: "Agent BB 2", images: [{ url: "https://x.test/b2.png", order: 1 }] });
  check("full: PATCH /billboards/{id}", r.status === 200 && (await prismadb.billboard.findUnique({ where: { id: bbId } }))?.label === "Agent BB 2", r);
  r = await proxy(tokenA, "DELETE", `billboards/${bbId}`);
  check("full: DELETE /billboards/{id}", r.status === 200 && !(await exists.billboard(bbId)), r);
  r = await proxy(tokenA, "GET", "orders/stats");
  check("full: GET /orders/stats (requireStoreOwner via the agent context)", r.status === 200, r);
  r = await proxy(tokenA, "GET", `users?x=1`);
  check("full: GET /users allowed", r.status === 200 && Array.isArray(r.body?.users) && typeof r.body.totalCount === "number", r);
  r = await proxy(tokenA, "POST", "media", { url: "https://example.com/a.png", source: "url" });
  check("full: POST /media registers a link", r.status === 200 && r.body.source === "url", r);
  const mediaId = r.body?.id;
  r = await proxy(tokenA, "DELETE", `media/${mediaId}`);
  check("full: DELETE /media/{id}", r.status === 200 && r.body.ok === true, r);
  r = await proxy(tokenA, "GET", "products/" + A.product.id + "?x=1");
  check("full: query string and by-id GET pass through", r.status === 200 && r.body.id === A.product.id, r);
  r = await proxy(tokenA, "POST", "billboards");
  check("full: a route's own validation error is returned as-is (400)", r.status === 400, r);
  check("full: log has ok entries", (await readAccess(A.store.id)).log.some((l) => l.outcome === "ok"));

  // ------------------------------------------------------------ 5. cross-store isolation
  const before = {
    p: await prismadb.product.findUniqueOrThrow({ where: { id: B.product.id } }),
    c: await prismadb.category.findUniqueOrThrow({ where: { id: B.category.id } }),
    b: await prismadb.billboard.findUniqueOrThrow({ where: { id: B.billboard.id } }),
    f: await prismadb.filter.findUniqueOrThrow({ where: { id: B.filter.id } }),
  };
  const body = {
    product: { name: "HACK", price: "1.00", quantity: 1, maxQuantity: 1, categoryId: B.category.id, images: [{ url: "https://x.test/h.png", order: 1 }] },
    category: { name: "HACK", billboardId: B.billboard.id, imageUrl: "https://x.test/h.png" },
    billboard: { label: "HACK", images: [{ url: "https://x.test/h.png", order: 1 }] },
    filter: { name: "HACK", value: [{ value: "1", unit: "u" }] },
  };
  const targets = [
    ["products", B.product.id, body.product, "product"],
    ["categories", B.category.id, body.category, "category"],
    ["billboards", B.billboard.id, body.billboard, "billboard"],
    ["filters", B.filter.id, body.filter, "filter"],
  ] as const;
  for (const [seg, id, patchBody, model] of targets) {
    const g = await proxy(tokenA, "GET", `${seg}/${id}`);
    check(`isolation: GET ${seg}/{other store's id} returns nothing`, g.status === 200 && g.body === null, g);
    const pa = await proxy(tokenA, "PATCH", `${seg}/${id}`, patchBody);
    check(`isolation: PATCH ${seg}/{other store's id} -> 404`, pa.status === 404, pa);
    const d = await proxy(tokenA, "DELETE", `${seg}/${id}`);
    check(`isolation: DELETE ${seg}/{other store's id} -> 404, record still there`, d.status === 404 && (await exists[model](id)), d);
  }
  const after2 = {
    p: await prismadb.product.findUniqueOrThrow({ where: { id: B.product.id } }),
    c: await prismadb.category.findUniqueOrThrow({ where: { id: B.category.id } }),
    b: await prismadb.billboard.findUniqueOrThrow({ where: { id: B.billboard.id } }),
    f: await prismadb.filter.findUniqueOrThrow({ where: { id: B.filter.id } }),
  };
  check("isolation: the other store's records are unchanged", JSON.stringify(before) === JSON.stringify(after2));
  r = await proxy(tokenA, "GET", `filters?name=${encodeURIComponent(B.filter.name)}`);
  check("isolation: GET /filters?name= does not search other stores", r.status === 200 && r.body === null, r);
  r = await proxy(tokenA, "GET", `filters?name=${encodeURIComponent(A.filter.name)}`);
  check("isolation: GET /filters?name= still finds its own", r.status === 200 && r.body?.id === A.filter.id, r);
  r = await proxy(tokenA, "GET", "products");
  check("isolation: list only has this store's products", r.status === 200 && r.body.every((p: any) => p.id !== B.product.id));
  r = await proxy(tokenA, "GET", "orders/" + "00000000-0000-0000-0000-000000000000");
  check("isolation: unknown order -> 404", r.status === 404, r);
  // The agent's own store still works for the same by-id calls
  r = await proxy(tokenA, "GET", `products/${A.product.id}`);
  check("isolation: own record is still reachable", r.status === 200 && r.body?.id === A.product.id);
  // Two links never mix: B's token sees only B
  const tokenB = await createLink(B.store.id, "full");
  r = await proxy(tokenB, "GET", `products/${A.product.id}`);
  check("isolation: B's link cannot read A's product", r.status === 200 && r.body === null, r);
  r = await proxy(tokenB, "GET", "products");
  check("isolation: B's link lists only B's products", r.body.length === 1 && r.body[0].id === B.product.id);
  await deleteLink(B.store.id);

  // ------------------------------------------------------------ 6. permission mode
  await deleteLink(A.store.id);
  const tokenP = await createLink(A.store.id, "permission");
  check("permission: new token differs and the old one is dead", tokenP !== tokenA && (await findByToken(tokenA)) === null && (await findByToken(tokenP))?.mode === "permission");
  r = await proxy(tokenP, "GET", "products");
  check("permission: reads run at once", r.status === 200 && Array.isArray(r.body));
  r = await proxy(tokenP, "POST", "billboards", { label: "Pending BB", images: [{ url: "https://x.test/p.png", order: 1 }] });
  const reqId = r.body?.requestId;
  check(
    "permission: write is NOT executed, 202 with requestId + approveUrl",
    r.status === 202 && r.body.status === "pending" && r.body.expiresInMinutes === 30 &&
      r.body.approveUrl === `http://localhost:3000/${A.store.id}/agent-requests/${reqId}` && /^[A-Za-z0-9_-]{12}$/.test(reqId) &&
      (await prismadb.billboard.count({ where: { storeId: A.store.id, label: "Pending BB" } })) === 0,
    r,
  );
  r = await status(tokenP, reqId);
  check("permission: status is pending, no result yet", r.status === 200 && r.body.status === "pending" && r.body.result === undefined, r);
  r = await decideRequest(A.store.id, OWNER_A, reqId, "allow").then((o) => ({ status: o.ok ? 200 : o.status, body: o.ok ? o.request : o }));
  check("permission: allow executes it", r.status === 200 && (await prismadb.billboard.count({ where: { storeId: A.store.id, label: "Pending BB" } })) === 1 && r.body.status === "approved" && r.body.result?.status === 200, r);
  r = await status(tokenP, reqId);
  check("permission: agent sees approved + result", r.body.status === "approved" && r.body.result?.status === 200 && r.body.result?.body?.label === "Pending BB", r);
  const again = await decideRequest(A.store.id, OWNER_A, reqId, "allow");
  check("permission: deciding twice -> 409 and not run twice", !again.ok && again.status === 409 && (await prismadb.billboard.count({ where: { storeId: A.store.id, label: "Pending BB" } })) === 1);

  r = await proxy(tokenP, "POST", "billboards", { label: "Denied BB", images: [{ url: "https://x.test/d.png", order: 1 }] });
  const denyId = r.body.requestId;
  const den = await decideRequest(A.store.id, OWNER_A, denyId, "deny");
  check("permission: deny sets denied and runs nothing", den.ok && den.request.status === "denied" && (await prismadb.billboard.count({ where: { storeId: A.store.id, label: "Denied BB" } })) === 0);
  r = await status(tokenP, denyId);
  check("permission: agent sees denied", r.body.status === "denied" && r.body.result === undefined, r);

  r = await proxy(tokenP, "DELETE", `products/${B.product.id}`);
  const otherId = r.body.requestId;
  const oth = await decideRequest(A.store.id, OWNER_A, otherId, "allow");
  check("permission: an approved request for another store's record still fails (isolation) -> failed", oth.ok && oth.request.status === "failed" && oth.request.result?.status === 404 && (await exists.product(B.product.id)), oth);

  r = await proxy(tokenP, "PATCH", "contact", { x: 1 });
  const badId = r.body.requestId;
  const bad = await decideRequest(A.store.id, OWNER_A, badId, "allow");
  check("permission: a route error is recorded as failed with its status", bad.ok && bad.request.status === "failed" && bad.request.result!.status >= 400, bad);

  r = await proxy(tokenP, "POST", "billboards", { label: "Expired BB", images: [{ url: "https://x.test/e.png", order: 1 }] });
  const expId = r.body.requestId;
  await prismadb.$executeRaw`UPDATE "Store" SET "agentAccess" = jsonb_set("agentAccess", '{requests}', (SELECT COALESCE(jsonb_agg(CASE WHEN e->>'id' = ${expId} THEN jsonb_set(e, '{createdAt}', to_jsonb(${old}::text)) ELSE e END), '[]'::jsonb) FROM jsonb_array_elements("agentAccess"->'requests') e)) WHERE id = ${A.store.id}`;
  r = await status(tokenP, expId);
  check("permission: expired request -> 404 for the agent", r.status === 404 && r.body.error === "Request expired or unknown", r);
  const ex = await decideRequest(A.store.id, OWNER_A, expId, "allow");
  check("permission: expired request cannot be approved (404) and is not run", !ex.ok && ex.status === 404 && (await prismadb.billboard.count({ where: { storeId: A.store.id, label: "Expired BB" } })) === 0);
  // a decided request is kept 30 min from the decision, not from creation
  const setField = (id: string, field: "createdAt" | "decidedAt", iso: string) =>
    prismadb.$executeRaw`UPDATE "Store" SET "agentAccess" = jsonb_set("agentAccess", '{requests}', (SELECT COALESCE(jsonb_agg(CASE WHEN e->>'id' = ${id} THEN jsonb_set(e, ARRAY[${field}], to_jsonb(${iso}::text)) ELSE e END), '[]'::jsonb) FROM jsonb_array_elements("agentAccess"->'requests') e)) WHERE id = ${A.store.id}`;
  await setField(badId, "createdAt", old);
  r = await status(tokenP, badId);
  check("lifetime: decided request created >30 min ago but decided just now is still there", r.status === 200 && r.body.status === "failed" && r.body.result?.status >= 400, r);
  await setField(badId, "decidedAt", old);
  r = await status(tokenP, badId);
  check("lifetime: decided request >30 min after the decision -> 404", r.status === 404, r);

  r = await status(tokenP, "nonexistent1");
  check("permission: unknown request -> 404", r.status === 404);
  r = await status(tokenP, denyId);
  const bStatus = await status(tokenB, denyId);
  check("permission: a request id is not visible through another link", bStatus.status === 401 || bStatus.status === 404);

  // big results are stored truncated
  await mutateAccess(A.store.id, () => undefined);
  const big = await proxy(tokenP, "POST", "media", { url: "https://example.com/big.png", source: "url", name: "x".repeat(150) });
  check("permission: media POST is a write -> pending too", big.status === 202);

  // ------------------------------------------------------------ 7. upload (fake Cloudinary)
  // Presigned direct upload: POST /upload-url, the agent uploads to Cloudinary itself, then registers with POST /media.
  // Cloudinary is faked by replacing global fetch (the Admin API size lookup and the destroy call).
  const realFetch = globalThis.fetch;
  let sizes: Record<string, number> = {};
  const destroyed: string[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const u = String(input);
    const m = u.match(/\/resources\/image\/upload\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      return id in sizes ? new Response(JSON.stringify({ bytes: sizes[id] }), { status: 200 }) : new Response("{}", { status: 404 });
    }
    if (u.endsWith("/image/destroy")) {
      destroyed.push(String(init?.body?.get?.("public_id")));
      return new Response(JSON.stringify({ result: "ok" }), { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    const tokU = await createLink(A.store.id, "permission"); // permission mode: upload-url and upload registration still run at once
    const uReq = (t: string, method = "POST") => new Request(`http://localhost:3000/api/agent/${t}/upload-url`, { method });
    check("upload-url: bad token -> 401", (await handleUploadUrl(uReq(createToken()), createToken())).status === 401);
    const ures = await handleUploadUrl(uReq(tokU), tokU);
    const ub = (await ures.json()) as any;
    const f = ub.fields ?? {};
    const pid = `ecom/${A.store.id}/${f.public_id}`;
    check(
      "upload-url: returns uploadUrl, signed fields (6 MB, folder, formats, random public_id) and instructions",
      ures.status === 200 && ub.uploadUrl === "https://api.cloudinary.com/v1_1/testcloud/image/upload" && f.api_key === "key" &&
        f.folder === `ecom/${A.store.id}` && f.max_file_size === 6291456 && f.allowed_formats === "jpg,jpeg,png,webp,gif,avif" &&
        /^[0-9a-f]{24}$/.test(f.public_id) && typeof f.timestamp === "number" && ub.expiresInMinutes === 60 && /upload-url|media/.test(ub.next),
      ub,
    );
    const crypto = await import("crypto");
    const expectedSig = crypto.createHash("sha1").update(`allowed_formats=${f.allowed_formats}&folder=${f.folder}&max_file_size=6291456&public_id=${f.public_id}&timestamp=${f.timestamp}secret`).digest("hex");
    check("upload-url: signature covers folder, formats, size, public_id and timestamp", f.signature === expectedSig, f);
    const ub2 = (await (await handleUploadUrl(uReq(tokU), tokU)).json()) as any;
    check("upload-url: every call gets a new public_id", ub2.fields.public_id !== f.public_id);
    check("upload-url: GET /upload-url is not a proxied path", (await proxy(tokU, "GET", "upload-url")).status === 403 && (await proxy(tokU, "POST", "upload", {})).status === 404);

    const reg = (id: string, over: Record<string, unknown> = {}) =>
      proxy(tokU, "POST", "media", { url: `https://res.cloudinary.com/testcloud/image/upload/v1/${id}.png`, publicId: id, source: "upload", ...over });
    sizes = { [pid]: 5 * 1024 * 1024 };
    let r2 = await reg(pid);
    check("upload: register after upload runs at once even in permission mode", r2.status === 200 && r2.body?.publicId === pid && !!(await prismadb.mediaImage.findFirst({ where: { storeId: A.store.id, id: r2.body.id } })), r2);
    const pid2 = `ecom/${A.store.id}/${ub2.fields.public_id}`;
    sizes = { [pid2]: 6 * 1024 * 1024 + 1 };
    r2 = await reg(pid2);
    check("upload: over 6 MB (real size from Cloudinary) refused and the asset destroyed", r2.status === 400 && /6 MB/.test(r2.body?.error) && destroyed.includes(pid2) && !(await prismadb.mediaImage.findFirst({ where: { storeId: A.store.id, publicId: pid2 } })), r2);
    r2 = await reg(pid2, { bytes: 1 });
    check("upload: the agent's own `bytes` claim is not trusted", r2.status === 400, r2);
    r2 = await reg(`ecom/${A.store.id}/never-uploaded`);
    check("upload: registering something never uploaded -> 400", r2.status === 400, r2);
    r2 = await reg(`ecom/${B.store.id}/x`);
    check("upload: another store's folder -> 400", r2.status === 400 && /folder/.test(r2.body?.error), r2);
    r2 = await reg(pid, { url: "https://evil.example.com/a.png" });
    check("upload: url that does not match the upload -> 400", r2.status === 400, r2);
    r2 = await proxy(tokU, "POST", "media", { url: "https://example.com/z.png", source: "url" });
    check("upload: a plain link is still a pending write in permission mode", r2.status === 202, r2);
  } finally {
    globalThis.fetch = realFetch;
  }

  // ------------------------------------------------------------ 7b. request size cap (no count cap), response size guard, logging
  {
    const tokS = await createLink(A.store.id, "permission");
    let last: Res = { status: 0, body: null };
    for (let i = 0; i < 60; i++) last = await proxy(tokS, "POST", "billboards", { label: `bulk-${i}` });
    check("requests: no count cap (60 pending requests accepted)", last.status === 202 && (await readAccess(A.store.id)).requests.length === 60, last);
    const filler = "x".repeat(190_000);
    let n = 0;
    let rr: Res = { status: 0, body: null };
    for (; n < 20; n++) {
      rr = await proxy(tokS, "POST", "billboards", { label: filler });
      if (rr.status !== 202) break;
    }
    check("requests: size cap -> 413 { error } telling the agent to wait", rr.status === 413 && /owner|expire/.test(rr.body?.error) && n >= 8 && n <= 11, { status: rr.status, n });
    check("requests: refused request was not stored", (await readAccess(A.store.id)).requests.length === 60 + n);

    // logging: reads are not logged, writes and errors are
    const tokL = await createLink(A.store.id, "full");
    await proxy(tokL, "GET", "products");
    await proxy(tokL, "GET", "categories");
    check("log: successful reads are not logged", (await readAccess(A.store.id)).log.length === 0);
    await proxy(tokL, "GET", "customer/me");
    await proxy(tokL, "POST", "billboards", { label: "log-bb", images: [{ url: "https://x.test/l.png", order: 1 }] });
    await proxy(tokL, "GET", "products/x/y/z");
    const lg = (await readAccess(A.store.id)).log;
    check("log: blocked, unknown and writes are logged", lg.length === 3 && lg[0].outcome === "blocked" && lg[1].method === "POST" && lg[1].outcome === "ok" && lg[2].outcome === "error", lg);

    // response size guard
    const bigLabel = "y".repeat(1_000_000);
    await prismadb.billboard.createMany({ data: Array.from({ length: 4 }, (_, i) => ({ storeId: A.store.id, label: `${bigLabel}${i}` })) });
    let g = await proxy(tokL, "GET", "billboards");
    check("response guard: > 3.5 MB -> 413 with the pagination hint", g.status === 413 && g.body?.error === "Response too large. Use ?page=1&pageSize=50", { s: g.status, e: g.body?.error });
    g = await proxy(tokL, "GET", "billboards?page=1&pageSize=2");
    check("response guard: a small page works", g.status === 200 && g.body.items.length === 2 && g.body.hasMore === true && g.body.page === 1 && g.body.pageSize === 2, { s: g.status });
    await prismadb.billboard.deleteMany({ where: { storeId: A.store.id, label: { startsWith: bigLabel } } });

    // opt-in pagination on the four lists; without ?page the answer is still a plain array
    for (let i = 0; i < 3; i++) await proxy(tokL, "POST", "filters", { name: `pg-f-${i}`, value: [{ value: 1, unit: "kg" }] });
    for (const seg of ["products", "categories", "billboards", "filters"]) {
      const plain = await proxy(tokL, "GET", seg);
      const p1 = await proxy(tokL, "GET", `${seg}?page=1&pageSize=1`);
      const p2 = await proxy(tokL, "GET", `${seg}?page=2&pageSize=1`);
      const all = await proxy(tokL, "GET", `${seg}?page=1`);
      check(`pagination: ${seg} without page is a plain array`, plain.status === 200 && Array.isArray(plain.body), plain.status);
      check(`pagination: ${seg} ?page=1&pageSize=1 -> { items, page, pageSize, hasMore }`, p1.status === 200 && p1.body.items.length === 1 && p1.body.page === 1 && p1.body.pageSize === 1 && typeof p1.body.hasMore === "boolean", p1.body);
      check(`pagination: ${seg} pages do not overlap, default size 50 holds everything`, (plain.body.length < 2 || (p1.body.hasMore === true && p2.body.items[0]?.id !== p1.body.items[0]?.id)) && all.body.pageSize === 50 && all.body.items.length === plain.body.length && all.body.hasMore === false);
    }
    const huge = await proxy(tokL, "GET", "categories?page=1&pageSize=1000");
    check("pagination: pageSize is capped at 100", huge.status === 200 && huge.body.pageSize === 100, huge.body);
    check("pagination: bad page -> 400", (await proxy(tokL, "GET", "products?page=0")).status === 400 && (await proxy(tokL, "GET", "products?page=abc")).status === 400);

    // mutateAccess retries once on a write conflict and never fails the agent call on a log failure
    let tries = 0;
    const origTx = prismadb.$transaction.bind(prismadb);
    (prismadb as any).$transaction = (...args: any[]) => {
      tries++;
      if (tries === 1) throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" });
      return (origTx as any)(...args);
    };
    try {
      await mutateAccess(A.store.id, () => undefined);
      check("mutateAccess: one retry on P2034", tries === 2, tries);
      tries = -10; // always throw from now on
      (prismadb as any).$transaction = () => {
        tries++;
        throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" });
      };
      let threw = false;
      await mutateAccess(A.store.id, () => undefined).catch(() => (threw = true));
      check("mutateAccess: gives up after ONE retry", threw && tries === -8, tries);
      await appendLog(A.store.id, { method: "POST", path: "/x", status: 200, outcome: "ok" });
      check("appendLog: a failure is swallowed", true);
    } finally {
      (prismadb as any).$transaction = origTx;
    }
  }

  // ------------------------------------------------------------ 8. skills
  check("skill: bad names refused", (await readSkill("../package", "x", A.store.id)) === null && (await readSkill("nope-nope", "x", A.store.id)) === null);
  const idx = await readSkill("index", "https://h/api/agent/T", A.store.id);
  check("skill: router served with {{BASE}} replaced", idx === null || (!idx.includes("{{BASE}}") && idx.includes("https://h/api/agent/T")), idx?.slice(0, 80));
  check("skill: {{STORE_URL}} is replaced with the storefront address", idx === null || (!idx.includes("{{STORE_URL}}") && idx.includes("/s/") && idx.includes("/product/{productId}")), idx?.slice(0, 80));

  // ------------------------------------------------------------ 8b. ids must belong to the store, quantity, filters, orders q
  {
    const tokenA = await createLink(A.store.id, "full"); // earlier links were replaced
    const tokenB = await createLink(B.store.id, "full");
    const img = [{ url: "https://x.test/p.png", order: 1 }];
    const pBody = (over: Record<string, unknown> = {}) => ({ name: "zz-p", price: "10.00", quantity: 1, maxQuantity: 2, categoryId: A.category.id, images: img, ...over });
    const vA = await prismadb.value.create({ data: { filterId: A.filter.id, value: 1, unit: "kg" } });
    const vB = await prismadb.value.create({ data: { filterId: B.filter.id, value: 1, unit: "kg" } });

    let r = await proxy(tokenA, "POST", "products", pBody({ categoryId: B.category.id }));
    check("store ids: product POST with another store's category -> 400", r.status === 400 && /Category not found/.test(r.body?.error), r);
    r = await proxy(tokenA, "POST", "products", pBody({ filteritems: [{ filterId: B.filter.id, valueId: vB.id }] }));
    check("store ids: product POST with another store's filter value -> 400", r.status === 400 && /Filter value not found/.test(r.body?.error), r);
    check("store ids: nothing was created by the refused POSTs", (await prismadb.product.count({ where: { storeId: A.store.id, name: "zz-p" } })) === 0);
    r = await proxy(tokenA, "POST", "categories", { name: "zz-c", billboardId: B.billboard.id, imageUrl: "https://x.test/c.png" });
    check("store ids: category POST with another store's billboard -> 400", r.status === 400 && /Billboard not found/.test(r.body?.error), r);
    r = await proxy(tokenA, "PATCH", `categories/${A.category.id}`, { name: "zz-c", billboardId: B.billboard.id, imageUrl: "https://x.test/c.png" });
    check("store ids: category PATCH with another store's billboard -> 400, unchanged", r.status === 400 && (await prismadb.category.findUniqueOrThrow({ where: { id: A.category.id } })).billboardId === A.billboard.id, r);
    r = await proxy(tokenA, "PUT", "home-layout", [{ type: "carousel", settings: { billboardId: B.billboard.id } }]);
    check("store ids: home layout with another store's billboard -> 400", r.status === 400, r);
    r = await proxy(tokenA, "PUT", "home-layout", [{ type: "productList", settings: { title: "t", categoryId: B.category.id } }]);
    check("store ids: home layout with another store's category -> 400", r.status === 400, r);
    r = await proxy(tokenA, "PUT", "home-layout", [{ type: "carousel", settings: { billboardId: A.billboard.id } }]);
    check("store ids: home layout with own billboard is saved", r.status === 200, r);

    // quantity
    r = await proxy(tokenA, "POST", "products", pBody({ name: "zz-zero", quantity: 0 }));
    check("quantity: 0 is accepted on POST (stock zero)", r.status === 200 && r.body?.quantity === 0, r);
    const zeroId = r.body?.id as string;
    for (const [label, over] of [
      ["negative", { quantity: -1 }],
      ["decimal", { quantity: 1.5 }],
      ["text", { quantity: "abc" }],
      ["missing", { quantity: undefined }],
      ["max 0", { maxQuantity: 0 }],
      ["max decimal", { maxQuantity: 1.5 }],
    ] as [string, Record<string, unknown>][]) {
      r = await proxy(tokenA, "POST", "products", pBody({ name: "zz-bad", ...over }));
      check(`quantity: ${label} refused on POST (400)`, r.status === 400, r);
    }
    r = await proxy(tokenA, "PATCH", `products/${zeroId}`, pBody({ name: "zz-zero", quantity: 3 }));
    check("quantity: PATCH can change 0 to 3", r.status === 200 && (await prismadb.product.findUniqueOrThrow({ where: { id: zeroId } })).quantity === 3, r);
    r = await proxy(tokenA, "PATCH", `products/${zeroId}`, pBody({ name: "zz-zero", quantity: 0 }));
    check("quantity: PATCH accepts 0", r.status === 200 && (await prismadb.product.findUniqueOrThrow({ where: { id: zeroId } })).quantity === 0, r);
    r = await proxy(tokenA, "PATCH", `products/${zeroId}`, pBody({ name: "zz-zero", quantity: -5 }));
    check("quantity: PATCH negative refused (400)", r.status === 400, r);
    r = await proxy(tokenA, "PATCH", `products/${zeroId}`, pBody({ name: "zz-zero", maxQuantity: 0 }));
    check("quantity: PATCH max 0 refused (400)", r.status === 400, r);
    r = await proxy(tokenA, "PATCH", `products/${zeroId}`, pBody({ name: "zz-zero", categoryId: B.category.id }));
    check("store ids: product PATCH with another store's category -> 400, images kept", r.status === 400 && (await prismadb.image.count({ where: { productId: zeroId } })) === 1, r);
    r = await proxy(tokenA, "PATCH", `products/${zeroId}`, pBody({ name: "zz-zero", filteritems: [{ valueId: vA.id }] }));
    check("store ids: product PATCH with own filter value works", r.status === 200 && (await prismadb.filterItem.count({ where: { productId: zeroId } })) === 1, r);
    r = await proxy(tokenA, "PATCH", `products/${zeroId}`, pBody({ name: "zz-zero", filteritems: [{ valueId: vB.id }] }));
    check("store ids: product PATCH with another store's value -> 400, links kept", r.status === 400 && (await prismadb.filterItem.count({ where: { productId: zeroId } })) === 1, r);

    // filter names are unique per store
    r = await proxy(tokenA, "POST", "filters", { name: "zz-shared", value: [{ value: 1, unit: "kg" }] });
    check("filters: name created in store A", r.status === 200, r);
    const sharedA = r.body?.id as string;
    r = await proxy(tokenB, "POST", "filters", { name: "zz-shared", value: [{ value: 1, unit: "kg" }] });
    check("filters: the same name is allowed in store B", r.status === 200, r);
    r = await proxy(tokenA, "POST", "filters", { name: "zz-shared", value: [{ value: 1, unit: "kg" }] });
    check("filters: duplicate name in the same store -> 409 plain message", r.status === 409 && r.body?.error === "A filter with this name already exists", r);
    r = await proxy(tokenA, "PATCH", `filters/${A.filter.id}`, { name: "zz-shared", value: [{ value: 1, unit: "kg" }] });
    check("filters: PATCH renaming to an existing name -> 409", r.status === 409, r);
    r = await proxy(tokenA, "PATCH", `filters/${sharedA}`, { name: "zz-shared", value: [{ value: 1, unit: "kg" }] });
    check("filters: PATCH keeping its own name is fine", r.status === 200, r);

    // filter PATCH keeps product links
    r = await proxy(tokenA, "POST", "filters", { name: "zz-weight", value: [{ value: 1, unit: "kg" }, { value: 2, unit: "kg" }, { unit: "pcs" }] });
    const wId = r.body?.id as string;
    r = await proxy(tokenA, "GET", `filters/${wId}`);
    const vals = r.body?.value as { id: string; value: string | null; unit: string }[];
    check("filters: GET by id returns value ids", Array.isArray(vals) && vals.length === 3 && vals.every((v) => typeof v.id === "string"), r);
    const v1 = vals.find((v) => Number(v.value) === 1)!;
    const v2 = vals.find((v) => Number(v.value) === 2)!;
    const vNone = vals.find((v) => v.value === null)!;
    r = await proxy(tokenA, "POST", "products", pBody({ name: "zz-linked", filteritems: vals.map((v) => ({ filterId: wId, valueId: v.id })) }));
    const linkedId = r.body?.id as string;
    // 1) id sent + changed text = rename in place, links kept; v2 omitted = deleted with its link
    r = await proxy(tokenA, "PATCH", `filters/${wId}`, { name: "zz-weight2", value: [{ id: v1.id, value: 10, unit: "kg" }, { id: vNone.id, unit: "pieces" }] });
    check("filters: PATCH ok", r.status === 200 && r.body?.name === "zz-weight2", r);
    const after = await prismadb.value.findMany({ where: { filterId: wId } });
    const links = await prismadb.filterItem.findMany({ where: { productId: linkedId } });
    check("filters: id + changed text keeps the same row, updated in place", after.length === 2 && Number(after.find((v) => v.id === v1.id)?.value) === 10 && after.find((v) => v.id === vNone.id)?.unit === "pieces", after);
    check("filters: omitted value is deleted", !after.some((v) => v.id === v2.id));
    check("filters: renamed values keep product links, omitted value's link is gone", links.length === 2 && links.some((l) => l.valueId === v1.id) && links.some((l) => l.valueId === vNone.id), links);

    // 2) no id = a new value, even with identical text; the old row is deleted with its links
    r = await proxy(tokenA, "PATCH", `filters/${wId}`, { name: "zz-weight2", value: [{ value: 10, unit: "kg" }, { id: vNone.id, unit: "pieces" }] });
    const after2 = await prismadb.value.findMany({ where: { filterId: wId } });
    const links2 = await prismadb.filterItem.findMany({ where: { productId: linkedId } });
    check("filters: no id = new value (identical text is NOT matched), old one deleted", r.status === 200 && after2.length === 2 && !after2.some((v) => v.id === v1.id) && after2.some((v) => Number(v.value) === 10) && after2.some((v) => v.id === vNone.id), after2);
    check("filters: the deleted value's product link is gone, the other stays", links2.length === 1 && links2[0].valueId === vNone.id, links2);

    // 3) foreign id (another store's value) = new value, the foreign row is untouched
    r = await proxy(tokenA, "PATCH", `filters/${wId}`, { name: "zz-weight2", value: [{ id: vNone.id, unit: "pieces" }, { id: vB.id, value: 7, unit: "kg" }] });
    const after3 = await prismadb.value.findMany({ where: { filterId: wId } });
    const vBnow = await prismadb.value.findUniqueOrThrow({ where: { id: vB.id } });
    check("filters: foreign value id is treated as a new value in this filter", r.status === 200 && after3.length === 2 && after3.some((v) => v.id !== vNone.id && v.id !== vB.id && Number(v.value) === 7), after3);
    check("filters: another store's value is not touched", vBnow.filterId === B.filter.id && vBnow.value?.toString() === "1", vBnow);

    // orders ?q=
    await prismadb.users.create({ data: { id: `${TAG}-user`, email: "zed.buyer@x.test", phone: "9000022222", fname: "Zedbuyer" } });
    const addr = await prismadb.address.create({ data: { usersId: `${TAG}-user`, value: "addr" } });
    await prismadb.order.create({
      data: { storeId: A.store.id, orderNumber: 4242, usersId: `${TAG}-user`, addressId: addr.id, total: "10.00", details: { v: 1, events: [], shipTo: { name: "Zedreceiver", phone: "9000011111", address: "addr", pincode: "560001", instructions: "" }, customerNote: null, adminContent: null, money: { subtotalPaise: 1000, shippingPaise: 0, totalPaise: 1000 }, items: [] } },
    });
    const ordersFor = async (q: string) => {
      const x = await proxy(tokenA, "GET", `orders?q=${encodeURIComponent(q)}`);
      return x.status === 200 ? (x.body.orders as unknown[]).length : -1;
    };
    check("orders q: empty q lists the order", (await ordersFor("")) === 1);
    check("orders q: #number finds it", (await ordersFor("#4242")) === 1 && (await ordersFor("#4243")) === 0);
    check("orders q: customer name / email / phone", (await ordersFor("zedbuyer")) === 1 && (await ordersFor("zed.buyer@")) === 1 && (await ordersFor("9000022222")) === 1);
    check("orders q: receiver name / phone", (await ordersFor("zedreceiver")) === 1 && (await ordersFor("9000011111")) === 1);
    check("orders q: no match -> empty", (await ordersFor("nomatch-zz")) === 0);
  }

  // ------------------------------------------------------------ 9. deleting the link kills access
  const tokenD = await createLink(A.store.id, "full");
  check("delete: link works before", (await proxy(tokenD, "GET", "products")).status === 200);
  await proxy(tokenD, "GET", "products");
  await deleteLink(A.store.id);
  check("delete: proxy -> 401 at once", (await proxy(tokenD, "GET", "products")).status === 401);
  check("delete: writes -> 401", (await proxy(tokenD, "POST", "billboards", { label: "x", images: [{ url: "https://x.test", order: 1 }] })).status === 401);
  check("delete: request status -> 401", (await status(tokenD, reqId)).status === 401);
  check("delete: token lookup is null", (await findByToken(tokenD)) === null);
  check("delete: column cleared (no link, no requests)", (await prismadb.store.findUniqueOrThrow({ where: { id: A.store.id }, select: { agentAccess: true } })).agentAccess === null);
  check("delete: no billboard was created after deletion", (await prismadb.billboard.count({ where: { storeId: A.store.id, label: "x" } })) === 0);
  check("delete: B's link is independent (B has none)", (await findByToken(tokenB)) === null);
}

async function cleanup() {
  if (createdStores.length) {
    // Raw SQL in a fixed order (the relations are emulated by Prisma, there are no real foreign keys).
    await prismadb.$executeRaw`DELETE FROM "Order" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Address" WHERE "usersId" = ${`${TAG}-user`}`;
    await prismadb.$executeRaw`DELETE FROM "Users" WHERE id = ${`${TAG}-user`}`;
    await prismadb.$executeRaw`DELETE FROM "filterItem" WHERE "productId" IN (SELECT id FROM "Product" WHERE "storeId" = ANY(${createdStores}))`;
    await prismadb.$executeRaw`DELETE FROM "Image" WHERE "productId" IN (SELECT id FROM "Product" WHERE "storeId" = ANY(${createdStores}))`;
    await prismadb.$executeRaw`DELETE FROM "billboardImage" WHERE "billboardId" IN (SELECT id FROM "Billboard" WHERE "storeId" = ANY(${createdStores}))`;
    await prismadb.$executeRaw`DELETE FROM "Value" WHERE "filterId" IN (SELECT id FROM "Filter" WHERE "storeId" = ANY(${createdStores}))`;
    await prismadb.$executeRaw`DELETE FROM "Filter" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "MediaImage" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Product" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Category" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Billboard" WHERE "storeId" = ANY(${createdStores})`;
    await prismadb.$executeRaw`DELETE FROM "Store" WHERE id = ANY(${createdStores})`;
  }
}

main()
  .catch((error) => {
    failed++;
    console.error("CRASH", error);
  })
  .finally(async () => {
    await cleanup();
    await prismadb.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });

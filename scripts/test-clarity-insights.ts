/**
 * Proves the dashboard's Clarity visitor numbers on the LOCAL database, with a fake Clarity server (no real calls):
 * first visit refreshes (3 calls), visits inside 8 hours use the saved copy (0 calls), a due refresh calls again,
 * a failed refresh keeps the old numbers and waits an hour, two visits at once call Clarity once, the token is never
 * returned by the settings API, and changing the token drops the saved numbers. Throw-away store (slug zz-clarity-test).
 *   npx tsx scripts/test-clarity-insights.ts      (DATABASE_URL = the local ecom_dev url)
 */
import prismadb from "@/lib/prismadb";
import { agentContext } from "@/lib/agent/context";
import { getVisitorInsights } from "@/lib/clarity-insights";
import { getStoreAnalytics } from "@/lib/orders/analytics";
import { readSettings, settingsPart, updateSettingsPart } from "@/lib/store-settings";
import * as route from "@/app/api/[storeId]/analytics/route";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + JSON.stringify(extra)}`);
};

const TOKEN = "eyJhbGciOiJSUzI1NiJ9.fake-payload_value.fake-signature-value";
let calls: { url: string; auth: string | null }[] = [];
let mode: "ok" | "429" | "401" = "ok";
const realFetch = globalThis.fetch;

const row = (key: string, name: string, sessions: number, bots: number, pps: number, extra: Record<string, string> = {}) => ({
  totalSessionCount: sessions,
  totalBotSessionCount: bots,
  distinctUserCount: sessions,
  pagesPerSessionPercentage: pps,
  [key]: name,
  ...extra,
});
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://www.clarity.ms/")) return realFetch(input, init);
  calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
  if (mode === "429") return new Response("{}", { status: 429 });
  if (mode === "401") return new Response("{}", { status: 401 });
  const dim = new URL(url).searchParams.get("dimension1")!;
  const key = dim;
  const rows =
    dim === "Source"
      ? [row(key, "Direct", 60, 5, 2), row(key, "google", 30, 1, 4), row(key, "", 10, 0, 1)]
      : dim === "Device"
        ? [row(key, "Mobile", 50, 3, 2, { Browser: "Chrome", OS: "Android" }), row(key, "Mobile", 20, 0, 2, { Browser: "Safari", OS: "iOS" }), row(key, "PC", 30, 3, 3, { Browser: "Edge", OS: "Windows" })]
        : [row(key, "India", 90, 6, 2), row(key, "Germany", 10, 0, 3)];
  return new Response(JSON.stringify([{ metricName: "Traffic", information: rows }, { metricName: "ScrollDepth", information: [] }]), { status: 200 });
}) as typeof fetch;

const patch = async (storeId: string, body: unknown) => {
  const req = new Request("http://localhost:3000/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const res = await agentContext.run({ userId: "user_zz_clarity", storeId }, () => route.PATCH(req, { params: Promise.resolve({ storeId }) }));
  return { status: res.status, text: await res.text() };
};
const get = async (storeId: string) => {
  const res = await agentContext.run({ userId: "user_zz_clarity", storeId }, () => route.GET(new Request("http://localhost:3000/x"), { params: Promise.resolve({ storeId }) }));
  return { status: res.status, text: await res.text() };
};
const saved = async (storeId: string) => settingsPart(await readSettings(storeId), "clarityInsights") as { nextTryAt: string; fetchedAt: string | null; error: string | null; data: any } | null;
const makeDue = (storeId: string) =>
  updateSettingsPart(storeId, "clarityInsights", (c: any) => ({ ...c, nextTryAt: new Date(Date.now() - 1000).toISOString() }));

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Local database only");
  await prismadb.store.deleteMany({ where: { slug: "zz-clarity-test" } });
  const s = await prismadb.store.create({ data: { name: "C", userId: "user_zz_clarity", slug: "zz-clarity-test" } });
  try {
    check("not connected: nothing shown, no calls", (await getVisitorInsights(s.id)).state === "not-connected" && calls.length === 0);

    check("project id saves", (await patch(s.id, { clarityProjectId: "abcdefghij" })).status === 200);
    check("project id but no token: asks for the token, no calls", (await getVisitorInsights(s.id)).state === "no-token" && calls.length === 0);

    check("a bad token is refused", (await patch(s.id, { clarityApiToken: "short" })).status === 400);
    const withToken = await patch(s.id, { clarityApiToken: TOKEN });
    check("token saves", withToken.status === 200 && JSON.parse(withToken.text).analytics.hasApiToken === true, withToken);
    check("the token is never returned", !withToken.text.includes(TOKEN) && !(await get(s.id)).text.includes(TOKEN) && !(await get(s.id)).text.includes("fake-payload"));
    check("an unknown field is refused", (await patch(s.id, { nope: 1 })).status === 400);

    // 1. first visit: refreshes
    const first = await getVisitorInsights(s.id);
    check("first visit makes 3 calls (source, device, country)", calls.length === 3, calls);
    check("calls use the bearer token and 3 days", calls.every((c) => c.auth === `Bearer ${TOKEN}` && c.url.includes("numOfDays=3")));
    check("the 3 breakdowns are Source, Device+Browser+OS, Country", ["Source", "Device", "Country"].every((d) => calls.some((c) => c.url.includes(`dimension1=${d}`))) && calls.some((c) => c.url.includes("dimension2=Browser") && c.url.includes("dimension3=OS")), calls.map((c) => c.url));
    const d = first.state === "ready" ? first.data : null;
    check("sessions add up over the sources (100), bots 6", d?.sessions === 100 && d?.botSessions === 6, d);
    check("pages per session is weighted by sessions (2.5)", Math.abs((d?.pagesPerSession ?? 0) - 2.5) < 1e-9, d?.pagesPerSession);
    check("top sources are sorted, an empty name becomes Unknown", d?.sources[0].name === "Direct" && d?.sources[2].name === "Unknown", d?.sources);
    check("devices (device, browser, OS) and countries are read", d?.devices[0].device === "Mobile" && d?.devices[0].browser === "Chrome" && d?.devices[0].os === "Android" && d?.devices[1].os === "Windows" && d?.countries[0].name === "India", d);
    check("the saved copy has the next time to ask (about 8 hours)", Math.abs(Date.parse((await saved(s.id))!.nextTryAt) - Date.now() - 8 * 3600e3) < 60e3);

    // 2. inside the 8 hours: saved copy, no calls
    calls = [];
    for (let i = 0; i < 5; i++) await getVisitorInsights(s.id);
    check("5 more visits inside 8 hours make 0 calls", calls.length === 0, calls.length);

    // 3. due: calls again
    await makeDue(s.id);
    await getVisitorInsights(s.id);
    check("when due, the next visit calls Clarity again (3 calls)", calls.length === 3, calls.length);

    // 4. due + two visits at once: one refresh
    calls = [];
    await makeDue(s.id);
    await Promise.all([getVisitorInsights(s.id), getVisitorInsights(s.id), getVisitorInsights(s.id)]);
    check("3 visits at the same moment call Clarity once (3 calls, not 9)", calls.length === 3, calls.length);

    // 5. failure keeps the numbers, waits an hour
    calls = [];
    mode = "429";
    await makeDue(s.id);
    const failed429 = await getVisitorInsights(s.id);
    const after = await saved(s.id);
    check("limit reached: old numbers are kept and the reason is shown", failed429.state === "ready" && failed429.data?.sessions === 100 && /daily limit/.test(failed429.error ?? ""), failed429);
    check("and it waits about an hour before trying again", Math.abs(Date.parse(after!.nextTryAt) - Date.now() - 3600e3) < 60e3);
    const n = calls.length;
    await getVisitorInsights(s.id);
    check("no calls while it waits", calls.length === n, calls.length);

    mode = "401";
    await makeDue(s.id);
    const bad = await getVisitorInsights(s.id);
    check("a rejected token says so", bad.state === "ready" && /did not accept/.test(bad.error ?? ""), bad);

    // 6. recovery
    mode = "ok";
    await makeDue(s.id);
    const ok = await getVisitorInsights(s.id);
    check("when Clarity answers again the error clears", ok.state === "ready" && ok.error === null && ok.data?.sessions === 100, ok);

    // 7. changing the token / project drops the saved numbers; saving the same project id does not
    check("saving the same project id keeps the saved numbers", (await patch(s.id, { clarityProjectId: "abcdefghij" })).status === 200 && (await saved(s.id)) !== null);
    check("a new token drops the saved numbers", (await patch(s.id, { clarityApiToken: TOKEN + "x" })).status === 200 && (await saved(s.id)) === null);
    await getVisitorInsights(s.id);
    check("a new project id drops them too", (await patch(s.id, { clarityProjectId: "zzzzzzzzzz" })).status === 200 && (await saved(s.id)) === null);
    check("removing the token turns the card back to the prompt", (await patch(s.id, { clarityApiToken: "" })).status === 200 && (await getVisitorInsights(s.id)).state === "no-token");

    // dashboard numbers: the hour / weekday query runs and has the right shape
    const a = await getStoreAnalytics(s.id);
    check("orders by hour/weekday: 24 hours, 7 weekdays, empty store = zeros", a.when.byHour.length === 24 && a.when.byWeekday.length === 7 && a.when.total === 0, a.when);
  } finally {
    await prismadb.store.deleteMany({ where: { id: s.id } });
    globalThis.fetch = realFetch;
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  await prismadb.$disconnect();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await prismadb.$disconnect();
  process.exit(1);
});

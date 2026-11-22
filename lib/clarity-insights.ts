import { parseClarityApiToken, parseClarityProjectId, readSettings, settingsPart, updateSettingsPart } from "@/lib/store-settings";

/**
 * Visitor numbers for the dashboard, from the owner's own Clarity project (Data Export API).
 *
 * Clarity allows 10 calls per project per day and only the last 1-3 days. One refresh makes 3 calls
 * (sources, devices, countries), so the numbers are refreshed at most every 8 hours = 9 calls a day.
 * Between refreshes the dashboard serves the saved copy (Store.settings.clarityInsights); nothing calls Clarity.
 * A failed refresh keeps the old numbers and is retried after an hour. The token stays on the server.
 */

const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
export const REFRESH_EVERY_HOURS = 8;
const RETRY_AFTER_FAILURE_HOURS = 1;
const CLAIM_MINUTES = 5; // one request claims a refresh; others serve the saved copy meanwhile
const DAYS = 3; // the most Clarity gives: the last 72 hours
const TOP = 5;
const MANY = 30; // devices and countries are kept in more detail than the top 5: the card groups them, the map colours them
const HOUR = 60 * 60 * 1000;

export type Breakdown = { name: string; sessions: number }[];
export type VisitorData = {
  days: number;
  sessions: number;
  botSessions: number;
  pagesPerSession: number;
  sources: Breakdown;
  devices: DeviceRow[]; // one row per device + browser + operating system, busiest first
  countries: Breakdown; // up to MANY, busiest first
};
export type DeviceRow = { device: string; browser: string; os: string; sessions: number };
type Saved = { fetchedAt: string | null; nextTryAt: string; error: string | null; data: VisitorData | null };

export type VisitorInsights =
  | { state: "not-connected" } // no Clarity project id
  | { state: "no-token"; projectId: string }
  | { state: "ready"; projectId: string; data: VisitorData | null; fetchedAt: string | null; error: string | null };

const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

function parseSaved(raw: unknown): Saved | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.nextTryAt !== "string") return null;
  // A copy saved in an older shape is dropped as a whole (so the next visit fetches again), not converted.
  if (r.data != null && !isVisitorData(r.data)) return null;
  return {
    fetchedAt: typeof r.fetchedAt === "string" ? r.fetchedAt : null,
    nextTryAt: r.nextTryAt,
    error: typeof r.error === "string" ? r.error : null,
    data: r.data != null ? (r.data as VisitorData) : null,
  };
}

function isVisitorData(v: unknown): v is VisitorData {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  const list = (x: unknown) => Array.isArray(x);
  return typeof d.sessions === "number" && list(d.sources) && list(d.countries) && list(d.devices) && (d.devices as DeviceRow[]).every((x) => typeof x?.device === "string" && typeof x?.os === "string");
}

// ---- the Clarity call

class ClarityError extends Error {}

// The numbers of a Traffic row. Seen in real answers: totalSessionCount, totalBotSessionCount, distinctUserCount,
// pagesPerSessionPercentage (the docs spell two of these differently), so names are compared without case.
const TRAFFIC_FIELDS = new Set(["totalsessioncount", "totalbotsessioncount", "distinctusercount", "distantusercount", "pagespersessionpercentage"]);
const field = (row: Record<string, unknown>, name: string) => {
  const key = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? row[key] : undefined;
};
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** One call: the Traffic rows of the response, broken down by up to 3 dimensions (`dims` = their values, in the order asked). */
async function fetchTraffic(token: string, dimensions: string[]) {
  let res: Response;
  const query = dimensions.map((d, i) => `dimension${i + 1}=${encodeURIComponent(d)}`).join("&");
  try {
    res = await fetch(`${ENDPOINT}?numOfDays=${DAYS}&${query}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ClarityError("Clarity did not answer in time.");
  }
  if (res.status === 401 || res.status === 403) throw new ClarityError("Clarity did not accept the API token. Generate a new one in Clarity and save it in Settings.");
  if (res.status === 429) throw new ClarityError("Clarity's daily limit for this project was reached. The numbers update again tomorrow.");
  if (!res.ok) throw new ClarityError(`Clarity returned an error (${res.status}).`);

  const body: unknown = await res.json().catch(() => null);
  const metric = Array.isArray(body)
    ? body.find((m) => typeof m?.metricName === "string" && m.metricName.toLowerCase() === "traffic")
    : null;
  const rows: Record<string, unknown>[] = Array.isArray(metric?.information) ? metric.information : [];
  return rows.map((row) => {
    // The dimensions' own keys ("Source", "Device", ...) are the ones that are not traffic numbers. A key that
    // matches the dimension's name is preferred; otherwise they are taken in the order they come.
    const keys = Object.keys(row).filter((k) => !TRAFFIC_FIELDS.has(k.toLowerCase()));
    const dims = dimensions.map((d, i) => {
      const key = keys.find((k) => letters(k) === letters(d)) ?? keys.find((k) => letters(d).startsWith(letters(k))) ?? keys[i];
      return key && row[key] != null && String(row[key]).trim() ? String(row[key]) : "Unknown";
    });
    return {
      name: dims[0],
      dims,
      sessions: num(field(row, "totalSessionCount")),
      bots: num(field(row, "totalBotSessionCount")),
      pagesPerSession: num(field(row, "pagesPerSessionPercentage")),
    };
  });
}

const top = (rows: { name: string; sessions: number }[], n = TOP): Breakdown =>
  rows
    .map(({ name, sessions }) => ({ name, sessions }))
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, n);

async function fetchVisitorData(token: string): Promise<VisitorData> {
  const [sources, devices, countries] = await Promise.all([
    fetchTraffic(token, ["Source"]),
    fetchTraffic(token, ["Device", "Browser", "OS"]),
    fetchTraffic(token, ["Country"]), // the docs say "Country/Region", but Clarity then ignores it: only "Country" splits by country
  ]);
  // Every row of one breakdown covers different sessions, so the rows add up to the total.
  const sessions = sources.reduce((n, r) => n + r.sessions, 0);
  return {
    days: DAYS,
    sessions,
    botSessions: sources.reduce((n, r) => n + r.bots, 0),
    pagesPerSession: sessions ? sources.reduce((n, r) => n + r.pagesPerSession * r.sessions, 0) / sessions : 0,
    sources: top(sources),
    devices: devices
      .filter((r) => r.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, MANY)
      .map((r) => ({ device: r.dims[0], browser: r.dims[1], os: r.dims[2], sessions: r.sessions })),
    countries: top(countries, MANY),
  };
}

// ---- cache

/**
 * What the dashboard shows. When 8 hours have passed since the last refresh, one request asks Clarity and
 * saves the answer; every other request (and every request before the 8 hours are up) gets the saved copy.
 */
export async function getVisitorInsights(storeId: string): Promise<VisitorInsights> {
  const raw = await readSettings(storeId);
  const projectId = parseClarityProjectId(raw);
  if (!projectId) return { state: "not-connected" };
  const token = parseClarityApiToken(raw);
  if (!token) return { state: "no-token", projectId };

  const saved = parseSaved(settingsPart(raw, "clarityInsights"));
  const view = (s: Saved | null): VisitorInsights => ({ state: "ready", projectId, data: s?.data ?? null, fetchedAt: s?.fetchedAt ?? null, error: s?.error ?? null });
  if (saved && Date.parse(saved.nextTryAt) > Date.now()) return view(saved);

  // Due. Claim the refresh under the row lock so two dashboards opened together make the calls only once.
  let claimed = false;
  const current = await updateSettingsPart<Saved>(storeId, "clarityInsights", (cur) => {
    const c = parseSaved(cur);
    if (c && Date.parse(c.nextTryAt) > Date.now()) return c; // someone else just did it
    claimed = true;
    return { fetchedAt: c?.fetchedAt ?? null, error: c?.error ?? null, data: c?.data ?? null, nextTryAt: isoIn(CLAIM_MINUTES * 60 * 1000) };
  });
  if (!claimed) return view(current);

  let next: Saved;
  try {
    const data = await fetchVisitorData(token);
    next = { fetchedAt: new Date().toISOString(), nextTryAt: isoIn(REFRESH_EVERY_HOURS * HOUR), error: null, data };
  } catch (e) {
    const error = e instanceof ClarityError ? e.message : "Could not reach Clarity.";
    console.error("[clarity-insights]", storeId, error);
    next = { fetchedAt: current?.fetchedAt ?? null, data: current?.data ?? null, nextTryAt: isoIn(RETRY_AFTER_FAILURE_HOURS * HOUR), error };
  }
  await updateSettingsPart(storeId, "clarityInsights", () => next);
  return view(next);
}

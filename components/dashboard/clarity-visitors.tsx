import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { REFRESH_EVERY_HOURS, type Breakdown, type DeviceRow, type VisitorData, type VisitorInsights } from "@/lib/clarity-insights";

import { dashCard, Empty, InsightCard, MinimizableGrid, plural, StatCard } from "./cards";
import { WorldMap } from "./world-map";

const n = (v: number) => Math.round(v).toLocaleString("en-IN");

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${plural(h, "hour")} ago`;
}

/** Rows of "name, bar, sessions and share of the list". */
const Shares = ({ rows, empty = "Nothing yet." }: { rows: Breakdown; empty?: string }) => {
  const total = rows.reduce((a, r) => a + r.sessions, 0);
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  if (rows.length === 0) return <Empty text={empty} />;
  return (
    <div className="space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex justify-between gap-3">
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {n(r.sessions)} · {Math.round((r.sessions / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.sessions / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

/** Adds the sessions of the rows that share a value (e.g. every row of "Chrome"). */
function groupBy(rows: DeviceRow[], pick: (r: DeviceRow) => string, limit = 5): Breakdown {
  const m = new Map<string, number>();
  for (const r of rows) m.set(pick(r), (m.get(pick(r)) ?? 0) + r.sessions);
  return Array.from(m, ([name, sessions]) => ({ name, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

const deviceName = (d: string) => (d === "PC" ? "Computer" : d);

/**
 * Visitor numbers from the owner's own Clarity project (last 3 days). Served from the saved copy; Clarity is asked
 * again only when it is more than 8 hours old (lib/clarity-insights.ts). Heatmaps, recordings and funnels stay in Clarity.
 */
export async function ClarityVisitors({ storeId, data }: { storeId: string; data: Promise<VisitorInsights> }) {
  const v = await data;
  if (v.state === "not-connected") return null;

  const open = (
    <a href={`https://clarity.microsoft.com/projects/view/${v.projectId}/dashboard`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
      Open in Clarity <ExternalLink className="h-3 w-3" />
    </a>
  );

  if (v.state === "no-token") {
    return (
      <>
        <h3 className="pt-2 text-lg font-semibold">Visitors</h3>
        <Card>
          <CardContent className="space-y-1 pt-6 text-sm text-muted-foreground">
            <p>
              Add your Clarity API token in{" "}
              <Link href={`/${storeId}/settings`} className="underline">
                Settings
              </Link>{" "}
              to see visitor numbers here. Heatmaps, recordings and funnels are in Clarity.
            </p>
            <p className="text-xs">{open}</p>
          </CardContent>
        </Card>
      </>
    );
  }

  const d = v.data;
  return (
    <>
      <h3 className="pt-2 text-lg font-semibold">Visitors</h3>
      <p className="-mt-3 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>{d ? `Last ${d.days} days, from Clarity. Updated ${ago(v.fetchedAt)}, refreshed at most every ${REFRESH_EVERY_HOURS} hours.` : "From Clarity."}</span>
        {open}
      </p>
      {v.error && (
        <p className="text-xs text-destructive">
          {d ? "Could not refresh: " : ""}
          {v.error}
        </p>
      )}
      {!d && !v.error && <p className="text-xs text-muted-foreground">Fetching your visitor numbers from Clarity. Reload this page in a minute.</p>}
      {d && <VisitorCards d={d} />}
    </>
  );
}

/** The visitor cards, each of which can be minimized. */
function VisitorCards({ d }: { d: VisitorData }) {
  const top = d.sources[0];
  const numbers = [
    dashCard(
      "v-sessions",
      "Sessions",
      <StatCard
        title="Sessions"
        value={n(d.sessions)}
        note={d.botSessions ? `Bot sessions: ${n(d.botSessions)}` : undefined}
        help="One session = one visit. The same person coming back later is a new session."
      />,
    ),
    dashCard(
      "v-pages",
      "Pages per session",
      <StatCard title="Pages per session" value={d.pagesPerSession ? d.pagesPerSession.toFixed(1) : "–"} help="How many pages a visitor opens in one visit, on average." />,
    ),
    dashCard(
      "v-top-source",
      "Top source",
      <StatCard
        title="Top source"
        value={top?.name ?? "–"}
        note={top ? `${n(top.sessions)} sessions` : undefined}
        help="The place that sent you the most visitors, for example google or direct (typed or pasted the link)."
      />,
    ),
  ];
  const panels = [
    dashCard(
      "v-sources",
      "Traffic sources",
      <InsightCard title="Traffic sources" note="Where visitors were before they opened your store: a search engine, another site, a social app, or direct.">
        <Shares rows={d.sources} />
      </InsightCard>,
    ),
    dashCard(
      "v-devices",
      "Devices",
      <InsightCard title="Devices" note="What visitors used to open the store. Computer, Mobile or Tablet; the browser; the operating system.">
        {d.devices.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                ["Device type", (r: DeviceRow) => deviceName(r.device)],
                ["Browser", (r: DeviceRow) => r.browser],
                ["Operating system", (r: DeviceRow) => r.os],
              ] as const
            ).map(([label, pick]) => (
              <div key={label}>
                <p className="mb-1 text-xs font-medium">{label}</p>
                <Shares rows={groupBy(d.devices, pick, 4)} />
              </div>
            ))}
            <div>
              <p className="mb-1 text-xs font-medium">Most used</p>
              <ul className="space-y-1 text-sm">
                {d.devices.slice(0, 4).map((r) => (
                  <li key={`${r.device}-${r.browser}-${r.os}`} className="flex justify-between gap-2">
                    <span className="truncate">
                      {deviceName(r.device)}, {r.browser}, {r.os}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{n(r.sessions)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </InsightCard>,
    ),
  ];
  const countries = [
    dashCard(
      "v-countries",
      "Countries",
      <InsightCard title="Countries" note="Where visitors are, by the country their device is in. Darker = more sessions.">
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[3fr_2fr]">
          <WorldMap countries={d.countries} />
          <Shares rows={d.countries.slice(0, 8)} />
        </div>
      </InsightCard>,
    ),
  ];
  return (
    <>
      <MinimizableGrid cards={numbers} className="sm:grid-cols-3" />
      <MinimizableGrid cards={panels} className="md:grid-cols-2" />
      <MinimizableGrid cards={countries} className="" />
    </>
  );
}

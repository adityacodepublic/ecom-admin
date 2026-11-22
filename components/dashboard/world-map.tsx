import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { GeometryCollection, Topology } from "topojson-specification";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";

/**
 * A small world map, drawn on the server as plain SVG (no map script is sent to the browser). Countries that had
 * visitors are shaded by how many; the others stay grey. Hover a country for its name and sessions.
 */

const W = 800;
const H = 420;

// Atlas names that differ from the names Clarity (or Intl) gives. Keys and values are written as letters only.
const ALIAS: Record<string, string> = {
  unitedstates: "unitedstatesofamerica",
  usa: "unitedstatesofamerica",
  russianfederation: "russia",
  czechrepublic: "czechia",
  turkiye: "turkey",
  tuerkiye: "turkey",
  republicofkorea: "southkorea",
  korea: "southkorea",
  democraticrepublicofthecongo: "demrepcongo",
  congokinshasa: "demrepcongo",
  congodrc: "demrepcongo",
  republicofthecongo: "congo",
  congobrazzaville: "congo",
  dominicanrepublic: "dominicanrep",
  centralafricanrepublic: "centralafricanrep",
  equatorialguinea: "eqguinea",
  swaziland: "eswatini",
  northmacedonia: "macedonia",
  ivorycoast: "cotedivoire",
  bosniaandherzegovina: "bosniaandherz",
  southsudan: "ssudan",
  solomonislands: "solomonis",
  falklandislands: "falklandis",
  burma: "myanmar",
  uae: "unitedarabemirates",
  uk: "unitedkingdom",
  greatbritain: "unitedkingdom",
};

const letters = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

let regionNames: Intl.DisplayNames | null = null;

/** One key per country, whatever way it is written ("India", "IN", "United States", "USA"). */
function countryKey(raw: string): string {
  let name = raw.trim();
  if (/^[A-Za-z]{2}$/.test(name)) {
    try {
      regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
      name = regionNames.of(name.toUpperCase()) ?? name;
    } catch {
      /* keep the code */
    }
  }
  const k = letters(name.replace(/\(.*?\)/g, ""));
  return ALIAS[k] ?? k;
}

const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
// Antarctica is left out: it only takes up room at the bottom of a small map.
const countries = feature(topology, topology.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
const path = geoPath(geoNaturalEarth1().fitSize([W, H], { type: "FeatureCollection", features: countries })).digits(1);
// The shapes never change: draw them once per server process.
const shapes = countries.map((f) => ({ name: f.properties.name, key: letters(f.properties.name), d: path(f) ?? "" }));

export function WorldMap({ countries: rows }: { countries: { name: string; sessions: number }[] }) {
  const byKey = new Map<string, { name: string; sessions: number }>();
  for (const r of rows) {
    const k = countryKey(r.name);
    const cur = byKey.get(k);
    byKey.set(k, { name: cur?.name ?? r.name, sessions: (cur?.sessions ?? 0) + r.sessions });
  }
  const max = Math.max(1, ...Array.from(byKey.values(), (v) => v.sessions));
  const matched = new Set(shapes.filter((s) => byKey.has(s.key)).map((s) => s.key));
  const missing = rows.filter((r) => !matched.has(countryKey(r.name)) && r.name !== "Unknown");

  return (
    <div className="mx-auto w-full max-w-xl">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map shaded by visitor sessions" className="h-auto w-full">
        {shapes.map((s) => {
          const hit = byKey.get(s.key);
          return (
            <path
              key={s.name}
              d={s.d}
              className={hit ? "stroke-background" : "fill-muted stroke-background"}
              fill={hit ? "#3b82f6" : undefined}
              fillOpacity={hit ? 0.3 + 0.7 * (hit.sessions / max) : undefined}
              strokeWidth={0.5}
            >
              <title>{hit ? `${hit.name}: ${hit.sessions} session${hit.sessions === 1 ? "" : "s"}` : s.name}</title>
            </path>
          );
        })}
      </svg>
      {missing.length > 0 && <p className="text-xs text-muted-foreground">Not drawn (too small for this map): {missing.map((m) => m.name).join(", ")}.</p>}
    </div>
  );
}

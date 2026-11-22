import { countryKey, H, shapes, W, WORLD_MAP_URL } from "@/lib/world-map";
import { plural } from "./cards";

/**
 * A small world map. The country shapes are one static image the browser keeps (lib/world-map.ts); on top, drawn on
 * the server, only the countries that had visitors, shaded by how many. Hover a shaded country for its sessions.
 */
export function WorldMap({ countries: rows }: { countries: { name: string; sessions: number }[] }) {
  const byKey = new Map<string, { name: string; sessions: number }>();
  for (const r of rows) {
    const k = countryKey(r.name);
    const cur = byKey.get(k);
    byKey.set(k, { name: cur?.name ?? r.name, sessions: (cur?.sessions ?? 0) + r.sessions });
  }
  const max = Math.max(1, ...Array.from(byKey.values(), (v) => v.sessions));
  const hits = shapes.flatMap((s) => {
    const hit = byKey.get(s.key);
    return hit ? [{ ...s, ...hit }] : [];
  });
  const matched = new Set(hits.map((s) => s.key));
  const missing = rows.filter((r) => !matched.has(countryKey(r.name)) && r.name !== "Unknown");

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG: nothing for next/image to optimise */}
        <img src={WORLD_MAP_URL} alt="" aria-hidden width={W} height={H} className="absolute inset-0 h-full w-full" />
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map shaded by visitor sessions" className="relative h-auto w-full">
          {hits.map((s) => (
            <path key={s.key} d={s.d} className="stroke-background" fill="#3b82f6" fillOpacity={0.3 + 0.7 * (s.sessions / max)} strokeWidth={0.5}>
              <title>{`${s.name}: ${plural(s.sessions, "session")}`}</title>
            </path>
          ))}
        </svg>
      </div>
      {missing.length > 0 && <p className="text-xs text-muted-foreground">Not drawn (too small for this map): {missing.map((m) => m.name).join(", ")}.</p>}
    </div>
  );
}

import { worldMapSvg } from "@/lib/world-map";

// Built once (at build time in production) and served as a file: the shapes never change. A new version of the
// shapes gets a new URL (lib/world-map.ts WORLD_MAP_URL), so the browser may keep this one for a year.
export const dynamic = "force-static";

export function GET() {
  return new Response(worldMapSvg(), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
}

import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { GeometryCollection, Topology } from "topojson-specification";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";

/**
 * The world map's shapes (server only): every country as an SVG path, projected once per server process. The
 * dashboard shows them as one static image the browser keeps (WORLD_MAP_URL, served by app/world-map-v1.svg) and
 * draws only the countries that had visitors on top, with the same projection, so the two line up.
 */

export const W = 800;
export const H = 420;

/** Where the static image is served. Change the version (here and the route folder) when the shapes change. */
export const WORLD_MAP_URL = "/world-map-v1.svg";

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
export function countryKey(raw: string): string {
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
export const shapes = countries.map((f) => ({ name: f.properties.name, key: letters(f.properties.name), d: path(f) ?? "" }));

/** Every country, in a neutral grey that reads on light and dark backgrounds (an image cannot use the page's theme colours). */
export const worldMapSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><g fill="#94a3b8" fill-opacity="0.28" stroke="#94a3b8" stroke-opacity="0.5" stroke-width="0.4">${shapes.map((s) => `<path d="${s.d}"/>`).join("")}</g></svg>`;

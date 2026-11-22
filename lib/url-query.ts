import type { z } from "zod";

type UrlParams = Record<string, string | string[] | undefined>;

/**
 * A page's URL query, leniently: each key is checked on its own and a bad or empty value is left out (that filter is
 * off), never an error, so a hand-edited link still opens the page. Defaults in the schema then fill the gaps.
 */
export function parseUrlQuery<S extends z.AnyZodObject>(schema: S, keys: readonly (keyof z.infer<S> & string)[], params: UrlParams): z.infer<S> {
  const raw: Record<string, string> = {};
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "string" && v !== "" && schema.safeParse({ [k]: v }).success) raw[k] = v;
  }
  return schema.parse(raw);
}

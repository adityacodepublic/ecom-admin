import { unstable_cache } from "next/cache";

/**
 * A per-store read kept in Next's data cache for `seconds` (shared by every request and server instance), so a page
 * that re-renders often (the dashboard on each range change) does not repeat reads whose answer has not changed.
 * The value must be plain JSON: Dates come back as strings, so return ISO strings yourself.
 * Outside Next (scripts, tests) there is no data cache: it reads every time.
 */
export function cachedPerStore<T>(name: string, seconds: number, load: (storeId: string) => Promise<T>): (storeId: string) => Promise<T> {
  return (storeId) => (process.env.NEXT_RUNTIME ? unstable_cache(() => load(storeId), [name, storeId], { revalidate: seconds })() : load(storeId));
}

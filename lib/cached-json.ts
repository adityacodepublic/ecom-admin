/**
 * JSON from our own API, kept in the browser for `ttlMs`: the same URL within that time gives back the same promise,
 * so a component can read it with React's use() (a promise must stay the same object between renders) and reopening
 * a dialog or a filter shows it at once. A failed request is forgotten, so the next try asks again.
 */
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function cachedJson<T>(url: string, ttlMs: number): Promise<T> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at < ttlMs) return hit.promise as Promise<T>;
  cache.forEach((v, k) => now - v.at >= ttlMs && cache.delete(k)); // drop old entries as new ones come
  const promise = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json() as Promise<T>;
  });
  promise.catch(() => cache.delete(url));
  cache.set(url, { at: now, promise });
  return promise;
}

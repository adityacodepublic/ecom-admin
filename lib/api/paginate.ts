/**
 * Opt-in pagination for list GETs. Without ?page the route answers exactly as before (a plain array: the store
 * app depends on that). With ?page=1&pageSize=50 the route answers { items, page, pageSize, hasMore }.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type PageParams = { page: number; pageSize: number; skip: number; take: number };

/** null = not paginated. { error } = bad value. Otherwise skip/take (take is pageSize + 1 to learn hasMore). */
export function readPage(sp: URLSearchParams): PageParams | null | { error: string } {
  const rawPage = sp.get("page");
  if (rawPage === null) return null;
  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 1) return { error: "page must be a whole number, 1 or more" };
  const rawSize = sp.get("pageSize");
  let pageSize = DEFAULT_PAGE_SIZE;
  if (rawSize !== null && rawSize !== "") {
    const n = Number(rawSize);
    if (!Number.isInteger(n) || n < 1) return { error: "pageSize must be a whole number, 1 or more" };
    pageSize = Math.min(n, MAX_PAGE_SIZE);
  }
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize + 1 };
}

export const isPageError = (p: PageParams | null | { error: string }): p is { error: string } =>
  !!p && "error" in p;

/** Builds the paginated response body from rows fetched with take = pageSize + 1. */
export function pageBody<T>(rows: T[], p: PageParams) {
  return { items: rows.slice(0, p.pageSize), page: p.page, pageSize: p.pageSize, hasMore: rows.length > p.pageSize };
}

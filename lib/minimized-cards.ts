/** The cookie that keeps the dashboard cards an owner minimized (card ids, comma separated), one per store. */
export const minimizedCookie = (storeId: string) => `dash-min-${storeId}`;

export const parseMinimized = (value: string | undefined) => (value ? decodeURIComponent(value).split(",").filter(Boolean).slice(0, 100) : []);

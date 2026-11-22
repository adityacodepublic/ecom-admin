/**
 * The cookie that keeps the dashboard cards an owner minimized, one per store. Each card is kept with its title, so
 * the page's one "Minimized cards" list can name it without a list of every card: "id:title" pairs (each part
 * URI-encoded), joined by "|" (a comma is not allowed in a cookie value). An older cookie held only ids (the whole
 * value encoded, comma separated): those entries use their id as the title.
 */
export type MinimizedCard = { id: string; title: string };

export const minimizedCookie = (storeId: string) => `dash-min-${storeId}`;

const MAX = 100;

export const serializeMinimized = (cards: MinimizedCard[]) => cards.map((c) => `${encodeURIComponent(c.id)}:${encodeURIComponent(c.title)}`).join("|");

export function parseMinimized(value: string | undefined): MinimizedCard[] {
  if (!value) return [];
  try {
    if (!value.includes(":"))
      return decodeURIComponent(value)
        .split(",")
        .filter(Boolean)
        .slice(0, MAX)
        .map((id) => ({ id, title: id }));
    return value
      .split("|")
      .slice(0, MAX)
      .flatMap((part) => {
        const [id, title] = part.split(":").map(decodeURIComponent);
        return id ? [{ id, title: title || id }] : [];
      });
  } catch {
    return []; // a broken cookie: nothing minimized
  }
}

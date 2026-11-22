import { isCancelled, isFinalStatus } from "@/lib/orders/status";

/** Dates shown in India time (orders are stored in UTC). */
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts });
const dateFmt = fmt({ day: "numeric", month: "short", year: "numeric" });
const timeFmt = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });

export const formatIstDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatIstTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatIstDateTime = (iso: string) => `${formatIstDate(iso)}, ${formatIstTime(iso)}`;
/** "YYYY-MM-DD" (a day, no time) -> "20 Nov 2026". */
export const formatDay = (day: string) => dateFmt.format(new Date(`${day}T12:00:00+05:30`));

/** Today in India as "YYYY-MM-DD". */
const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNumber = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86400000);

/** How long ago a moment was, in whole calendar days (India dates): "today", "yesterday", "20 days ago". */
export function daysAgoLabel(iso: string): string {
  const then = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const n = dayNumber(todayIst()) - dayNumber(then);
  if (n <= 0) return "today";
  return n === 1 ? "yesterday" : `${n} days ago`;
}

/** Whole days from today (India date) to the expected day: negative = overdue. */
export const daysUntil = (day: string) => dayNumber(day) - dayNumber(todayIst());

/** "3 days left", "Due today", "Overdue by 2 days" for an open order; the status text itself once it is over. */
export function deliveryLabel(day: string | null, status: string, statuses: readonly string[]): { text: string; overdue: boolean } {
  if (isCancelled(status) || isFinalStatus(statuses, status)) return { text: status, overdue: false };
  if (!day) return { text: "No date", overdue: false };
  const n = daysUntil(day);
  if (n === 0) return { text: "Due today", overdue: false };
  if (n > 0) return { text: `${n} day${n === 1 ? "" : "s"} left`, overdue: false };
  return { text: `Overdue by ${-n} day${n === -1 ? "" : "s"}`, overdue: true };
}

/** A length of time from hours: "5.5 hours" under two days, "3.2 days" from there. */
export const durationLabel = (hours: number) => (hours < 48 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`);

/** Placed -> delivered, as durationLabel. */
export const tookLabel = (fromIso: string, toIso: string) => durationLabel(Math.max(0, Date.parse(toIso) - Date.parse(fromIso)) / 3600000);

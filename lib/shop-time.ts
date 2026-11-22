/**
 * The shop's clock. The stores sell in India (INR), so days, hours and weekdays are read in India time, which has no
 * daylight saving (always UTC+05:30). One module for every place that cuts time into days or hours, so a dashboard
 * card and the Orders filter it links to always use the same clock. No database import: safe in client components.
 */

export const SHOP_TIME_ZONE = "Asia/Kolkata";
export const SHOP_UTC_OFFSET_MS = 330 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** A moment as its shop day, "YYYY-MM-DD". */
export const shopDay = (at: Date | string | number = Date.now()) => new Date(new Date(at).getTime() + SHOP_UTC_OFFSET_MS).toISOString().slice(0, 10);

/** Today in the shop, "YYYY-MM-DD". */
export const todayShop = () => shopDay();

/** The first moment of a shop day ("YYYY-MM-DD"). */
export const shopDayStart = (day: string) => new Date(`${day}T00:00:00.000+05:30`);

/** The first moment of the day after. */
export const nextShopDayStart = (day: string) => new Date(shopDayStart(day).getTime() + DAY_MS);

/** Whole days since 1970 of a "YYYY-MM-DD" day: subtract two to count the days between them. */
export const dayNumber = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY_MS);

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** 0-23 -> "12 am" ... "11 pm". */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

/** 0-23 -> "7 pm to 8 pm". */
export const hourRangeLabel = (h: number) => `${hourLabel(h)} to ${hourLabel((h + 1) % 24)}`;

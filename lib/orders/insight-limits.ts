/**
 * How many rows a dashboard dialog lists (the newest or biggest first; its count says how many there are in all).
 * Shared by the server that reads them (lib/orders/analytics.ts, the Orders API) and the dialogs that say
 * "Newest 25 of 40". No database import: safe in client components.
 */
export const INSIGHT_LIMITS = {
  reasonOrders: 25, // orders per cancel / return reason
  delivered: 100, // delivered orders in "Time to delivery" (the average counts all of them)
  buyers: 100, // buyers in a Buyers group, biggest spenders first
  barOrders: 50, // orders behind one hour / weekday bar
} as const;

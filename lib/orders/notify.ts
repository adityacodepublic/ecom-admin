import prismadb from "@/lib/prismadb";
import { parseOrderSettings } from "./settings";

/**
 * Order emails: an internal server function (the old public POST /mail/orderConfirm route is removed).
 * Off unless the store turned on settings.orders.autoEmails. The real sending and the templates come later
 * (a verified domain is needed for Resend). When sending is built: send here, then append an "email"
 * event with appendOrderEvent (lib/orders/update.ts).
 * Never throws: an email problem must not fail an order.
 */
export type OrderEmailKind = "placed" | "status" | "custom";

export async function notifyOrder(storeId: string, orderId: string, kind: OrderEmailKind): Promise<{ sent: boolean; reason: string }> {
  try {
    const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { settings: true } });
    if (!store) return { sent: false, reason: "store not found" };
    if (!parseOrderSettings(store.settings).autoEmails) return { sent: false, reason: "automatic emails are off" };
    console.info(`[ORDER_EMAIL] would send "${kind}" for order ${orderId}: sending is not built yet`);
    return { sent: false, reason: "email sending is not built yet" };
  } catch (error) {
    console.error("[ORDER_EMAIL]", error);
    return { sent: false, reason: "error" };
  }
}

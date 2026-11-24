"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { ArrowLeft, ArrowRight, Check, Copy, Lock, MessageCircle, Pencil, Phone, Mail, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MarkdownView } from "@/components/ui/markdown-view";
import { PaymentBadge, StatusBadge, paymentMethodLabel } from "@/components/orders/status-badge";
import { formatINR } from "@/lib/money";
import { daysAgoLabel, formatDay, formatIstDateTime } from "@/lib/format-date";
import type { AdminOrder } from "@/lib/orders/queries";
import type { OrderEvent } from "@/lib/orders/details";
import { STATUS_LOCK_MESSAGES, isCancelled, isQuote } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

import {
  CancelModal,
  DeliveryModal,
  MessageModal,
  NotesModal,
  PaymentModal,
  RejectReturnModal,
  ReplaceReturnModal,
  ReplaceStatusModal,
  useOrderPatch,
} from "./order-modals";
import { QuoteModal } from "./quote-modal";
import { CallLink } from "@/components/ui/call-link";

type ModalKey = "cancel" | "replace" | "reject" | "replaceReturn" | "delivery" | "payment" | "notes" | "message" | "quote";

/** Where a quote is, in the seller's words. */
const QUOTE_NOTE: Record<NonNullable<AdminOrder["quote"]>["state"], string> = {
  requested: "The customer asked for a quote. Add the prices with the pencil on Items and send them.",
  sent: "Quote sent. Waiting for the customer to accept or decline. You can still change it and send it again.",
  accepted: "The customer accepted the quote.",
  declined: "The customer declined the quote.",
};

const PencilButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button size="icon" variant="outline" className="h-8 w-8" aria-label={label} title={label} onClick={onClick}>
    <Pencil className="h-4 w-4" />
  </Button>
);

const digits = (s: string) => s.replace(/\D/g, "");
/** wa.me needs the country code: a 10-digit Indian number gets 91 in front. */
const waNumber = (phone: string) => {
  const d = digits(phone);
  return d.length === 10 ? `91${d}` : d;
};

/** When each status was last reached (from the timeline). */
function reachedAt(events: OrderEvent[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of events) if (e.type === "status" && e.status) out[e.status] = e.at;
  return out;
}

function eventText(e: OrderEvent): string {
  if (e.type === "status" && e.status) {
    const label = e.message === "Order placed" ? "Order placed" : `Status: ${e.status}`;
    return e.message && e.message !== "Order placed" ? `${label}. ${e.message}` : label;
  }
  return e.message || e.type;
}

const ACTOR: Record<OrderEvent["actor"], string> = { customer: "customer", admin: "you", system: "system" };

/** The store's status list as a stepper. An old status (not in the list) highlights nothing. */
const Stepper = ({ order }: { order: AdminOrder }) => {
  const steps = order.statuses;
  const at = reachedAt(order.events);
  const cancelled = isCancelled(order.status);
  // The current step (for a cancelled order: the furthest one reached before cancelling).
  const current = cancelled ? Math.max(-1, ...steps.map((s, i) => (at[s] ? i : -1))) : steps.indexOf(order.status);

  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-2">
      {steps.map((s, i) => {
        const done = i <= current;
        const here = !cancelled && i === current;
        return (
          <li key={s} className="flex items-center gap-3 sm:min-w-0 sm:flex-1 sm:flex-col sm:items-start sm:gap-1">
            <div className="flex items-center sm:w-full">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs",
                  done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 text-muted-foreground",
                  here && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              {i < steps.length - 1 && <span className={cn("ml-2 hidden h-0.5 flex-1 sm:block", i < current ? "bg-primary" : "bg-muted")} />}
            </div>
            <div className="min-w-0 text-sm">
              <div className={cn("break-words", done ? "font-medium" : "text-muted-foreground")}>{s}</div>
              <div className="text-xs text-muted-foreground">{done && at[s] ? formatIstDateTime(at[s]) : ""}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

/** Move forward / back one step, cancel, or replace an old status. Forward and back save at once. */
const StatusActions = ({ order, onCancel, onReplace }: { order: AdminOrder; onCancel: () => void; onReplace: () => void }) => {
  const { save, loading } = useOrderPatch(order, () => {});
  if (isCancelled(order.status)) {
    if (!order.canRestoreStock) return null;
    return (
      <div className="space-y-1">
        <Button size="sm" variant="outline" disabled={loading} onClick={() => save({ restoreStock: true })}>
          Restore stock
        </Button>
        <p className="text-xs text-muted-foreground">Adds the items back to your product stock. Do it when the items are back with you, or skip it if they are lost or damaged.</p>
      </div>
    );
  }
  if (order.statusLock === "QUOTE") return <p className="text-sm text-muted-foreground">{STATUS_LOCK_MESSAGES.QUOTE}</p>;
  if (order.statusLock) {
    // Frozen: a complete order (final stage) or an order with a return cannot be moved, back or cancelled any more.
    return <p className="text-sm text-muted-foreground">{STATUS_LOCK_MESSAGES[order.statusLock]}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!order.statusKnown && (
        <Button size="sm" onClick={onReplace}>
          Update status
        </Button>
      )}
      {/* Back on the left, forward after it (the way the steps run), cancel apart on the right. */}
      {order.prevStatus && (
        <Button size="sm" variant="outline" disabled={loading} onClick={() => save({ status: order.prevStatus })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to {order.prevStatus}
        </Button>
      )}
      {order.nextStatus && (
        <Button size="sm" disabled={loading} onClick={() => save({ status: order.nextStatus })}>
          Move to {order.nextStatus} <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      )}
      {order.canCancel && (
        <Button size="sm" variant="outline" className="ml-auto text-destructive" onClick={onCancel}>
          Cancel order
        </Button>
      )}
    </div>
  );
};

/** The return of this order: where it is, move it forward/back, reject it, and put the items back into stock. */
const ReturnCard = ({ order, onReject, onReplace }: { order: AdminOrder; onReject: () => void; onReplace: () => void }) => {
  const { save, loading } = useOrderPatch(order, () => {});
  const ret = order.return;
  if (!ret) return null;
  const steps = order.returnStatuses;
  const current = steps.indexOf(ret.status);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Return{" "}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-semibold",
              ret.rejected ? "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300" : "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
            )}
          >
            {ret.status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="text-xs font-medium text-muted-foreground">Reason</div>
          <div>{ret.reason}</div>
          {ret.note && <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{ret.note}</div>}
          <div className="mt-1 text-xs text-muted-foreground">Asked on {formatIstDateTime(ret.requestedAt)}</div>
        </div>

        {!ret.rejected && (
          <ol className="flex flex-wrap gap-x-4 gap-y-1">
            {steps.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-1", i <= current ? "font-medium" : "text-muted-foreground")}>
                {i <= current ? <Check className="h-3.5 w-3.5" /> : <span className="inline-block h-3.5 w-3.5 rounded-full border" />} {s}
              </li>
            ))}
          </ol>
        )}
        {!ret.statusKnown && !ret.rejected && <p className="text-muted-foreground">&quot;{ret.status}&quot; is not in your return statuses any more.</p>}

        {!ret.rejected && (
          <div className="flex flex-wrap items-center gap-2">
            {!ret.statusKnown && (
              <Button size="sm" onClick={onReplace}>
                Update return status
              </Button>
            )}
            {ret.prevStatus && (
              <Button size="sm" variant="outline" disabled={loading} onClick={() => save({ returnStatus: ret.prevStatus })}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to {ret.prevStatus}
              </Button>
            )}
            {ret.nextStatus && (
              <Button size="sm" disabled={loading} onClick={() => save({ returnStatus: ret.nextStatus })}>
                Move to {ret.nextStatus} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            {ret.canReject && (
              <Button size="sm" variant="outline" className="ml-auto text-destructive" onClick={onReject}>
                Reject return
              </Button>
            )}
          </div>
        )}

        <div className="space-y-1 border-t pt-3">
          {ret.restocked ? (
            <p className="text-muted-foreground">Stock: the items were put back into stock.</p>
          ) : !ret.canRestock ? (
            <p className="text-muted-foreground">Stock: nothing to put back (it was already put back, or this order never took stock).</p>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={loading} onClick={() => save({ restock: true })}>
                Put items back into stock
              </Button>
              <p className="text-xs text-muted-foreground">
                Do this when the items came back in good condition. Skip it for damaged items. Payment is not changed: set it yourself in Payment.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export const OrderView = ({ order }: { order: AdminOrder }) => {
  const { storeId } = useParams<{ storeId: string }>();
  // An open quote (the customer asked, or the prices are sent and wait for a yes): the Items card holds it, and the
  // Status card stays hidden until the quote is accepted (an order to move on) or closed.
  const quoteOpen = !!order.quote && (order.quote.state === "requested" || order.quote.state === "sent") && isQuote(order.status);
  // A price-on-request line before the quote is sent has no price yet.
  const unpriced = (i: AdminOrder["items"][number]) => i.onRequest && order.quote?.state === "requested";
  const [modal, setModal] = useState<ModalKey | null>(null);
  const close = () => setModal(null);
  // A new key after every save or open, so each modal starts from the saved values.
  const mk = (name: ModalKey) => `${name}-${order.updatedAt}-${modal === name}`;

  const phone = order.shipTo.phone || order.customer?.phone || "";
  const customerPhone = order.customer?.phone || "";
  const addressText = [order.shipTo.name, order.shipTo.phone, order.shipTo.street, order.shipTo.city, order.shipTo.state, order.shipTo.pincode, order.shipTo.country].filter(Boolean).join(", ");
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(addressText);
      toast.success("Address copied.");
    } catch {
      toast.error("Could not copy. Select the text instead.");
    }
  };

  return (
    <>
      <CancelModal key={mk("cancel")} order={order} isOpen={modal === "cancel"} onClose={close} />
      <ReplaceStatusModal key={mk("replace")} order={order} isOpen={modal === "replace"} onClose={close} />
      <RejectReturnModal key={mk("reject")} order={order} isOpen={modal === "reject"} onClose={close} />
      <ReplaceReturnModal key={mk("replaceReturn")} order={order} isOpen={modal === "replaceReturn"} onClose={close} />
      <DeliveryModal key={mk("delivery")} order={order} isOpen={modal === "delivery"} onClose={close} />
      <PaymentModal key={mk("payment")} order={order} isOpen={modal === "payment"} onClose={close} />
      <NotesModal key={mk("notes")} order={order} isOpen={modal === "notes"} onClose={close} />
      <MessageModal key={mk("message")} order={order} isOpen={modal === "message"} onClose={close} />
      {order.canEditQuote && <QuoteModal key={mk("quote")} order={order} isOpen={modal === "quote"} onClose={close} />}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href={`/${storeId}/orders`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> Orders
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Order #{order.orderNumber}</h2>
            <StatusBadge status={order.status} statuses={order.statuses} />
          </div>
          <p className="text-sm text-muted-foreground">
            Placed {formatIstDateTime(order.createdAt)} (India time, {daysAgoLabel(order.createdAt)}) · {formatINR(order.totalPaise)}
          </p>
        </div>
      </div>
      <Separator />

      {/* Status */}
      {!quoteOpen && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isCancelled(order.status) && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>
                  This order was cancelled.{" "}
                  {order.stockRestored
                    ? order.events.find((e) => e.type === "system" && e.message?.startsWith("Stock restored"))?.message ?? "Its items are back in stock."
                    : order.canRestoreStock
                      ? "Stock was not changed: the items are still counted as sold."
                      : ""}
                </span>
              </div>
            )}
            {!order.statusKnown && !isCancelled(order.status) && !isQuote(order.status) && (
              <p className="text-sm text-muted-foreground">&quot;{order.status}&quot; is not in your status list any more.</p>
            )}
            <Stepper order={order} />
            <StatusActions order={order} onCancel={() => setModal("cancel")} onReplace={() => setModal("replace")} />
          </CardContent>
        </Card>
      )}

      <ReturnCard order={order} onReject={() => setModal("reject")} onReplace={() => setModal("replaceReturn")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Items ({order.itemCount})</CardTitle>
              {order.canEditQuote && <PencilButton label="Set the quote prices" onClick={() => setModal("quote")} />}
            </CardHeader>
            <CardContent className="space-y-3">
              {order.items.map((i) => (
                <div key={i.productId} className="flex items-center gap-3">
                  <Link href={`/${storeId}/products/${i.productId}`} className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${i.name}`}>
                    {i.imageUrl ? (
                      <img src={i.imageUrl} alt="" className="h-12 w-12 rounded-md border object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-md border bg-muted" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/${storeId}/products/${i.productId}`} className="block truncate font-medium hover:underline">
                      {i.name}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {unpriced(i) ? "Price on request" : formatINR(i.pricePaise)} x {i.quantity}
                    </div>
                  </div>
                  <div className="whitespace-nowrap font-medium">{unpriced(i) ? "–" : formatINR(i.lineTotalPaise)}</div>
                </div>
              ))}
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatINR(order.money.subtotalPaise)}</span>
                </div>
                {order.money.shippingPaise > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>{formatINR(order.money.shippingPaise)}</span>
                  </div>
                )}
                {order.charges.map((c, n) => (
                  <div key={n} className="flex justify-between">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span>{formatINR(c.amountPaise)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatINR(order.money.totalPaise)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {order.quote
                  ? order.quote.state === "requested"
                    ? "A quote request: the total so far counts only the products that have a price."
                    : "Prices from your quote."
                  : "Prices as they were when the order was placed."}
              </p>
              {quoteOpen && order.quote && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <span className="min-w-0 flex-1">{QUOTE_NOTE[order.quote.state]}</span>
                  {order.canCancel && (
                    <Button size="sm" variant="outline" className="shrink-0 border-red-500/40 bg-background text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:text-red-300" onClick={() => setModal("cancel")}>
                      Cancel quote
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {[...order.events].reverse().map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.customerVisible ? "bg-primary" : "bg-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <div className="whitespace-pre-wrap break-words">{eventText(e)}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {formatIstDateTime(e.at)} · by {ACTOR[e.actor]}
                        </span>
                        {!e.customerVisible && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5">
                            <Lock className="h-3 w-3" /> only you
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Message to customer */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Message to customer</CardTitle>
              <PencilButton label="Edit message to customer" onClick={() => setModal("message")} />
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-muted-foreground">Shown on the customer&apos;s order page.</p>
              {order.adminContent ? (
                <MarkdownView>{order.adminContent}</MarkdownView>
              ) : (
                <p className="text-sm text-muted-foreground">No message yet. For example how to pay, or a thank you note.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Customer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="font-medium">{order.customer?.fname || order.shipTo.name || "Unknown"}</div>
              {customerPhone && <div>{customerPhone}</div>}
              {order.customer?.email && (
                <a href={`mailto:${order.customer.email}`} className="flex items-center gap-1 break-all hover:underline">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {order.customer.email}
                </a>
              )}
              {phone && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild>
                    <CallLink phone={phone}>
                      <Phone className="mr-1 h-4 w-4" /> Call
                    </CallLink>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ship to */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Ship to</CardTitle>
              <Button size="sm" variant="outline" onClick={copyAddress}>
                <Copy className="mr-1 h-4 w-4" /> Copy
              </Button>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="font-medium">{order.shipTo.name}</div>
              <div>{order.shipTo.phone}</div>
              <div className="whitespace-pre-wrap break-words">{order.shipTo.street}</div>
              <div>{[order.shipTo.city, order.shipTo.state].filter(Boolean).join(", ")}</div>
              <div>PIN {order.shipTo.pincode}{order.shipTo.country ? `, ${order.shipTo.country}` : ""}</div>
              {order.shipTo.instructions && <div className="text-muted-foreground">Delivery instructions: {order.shipTo.instructions}</div>}
              <Separator className="my-2" />
              <div className="text-xs font-medium text-muted-foreground">Note from the buyer</div>
              {order.customerNote ? <MarkdownView>{order.customerNote}</MarkdownView> : <p className="text-muted-foreground">No note.</p>}
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Payment</CardTitle>
              <PencilButton label="Edit payment" onClick={() => setModal("payment")} />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Method</span>
                <span>{paymentMethodLabel(order.payment)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <PaymentBadge status={order.paymentStatus} />
              </div>
            </CardContent>
          </Card>

          {/* Expected delivery */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Expected delivery</CardTitle>
              <PencilButton label="Edit expected delivery" onClick={() => setModal("delivery")} />
            </CardHeader>
            <CardContent className="text-sm">
              {order.expectedDelivery ? (
                <div className="font-medium">{formatDay(order.expectedDelivery)}</div>
              ) : (
                <p className="text-muted-foreground">No date yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Notes (admin only) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <Lock className="h-4 w-4" /> Notes
              </CardTitle>
              <PencilButton label="Edit notes" onClick={() => setModal("notes")} />
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">Only you can see this. The customer never sees it.</p>
              {order.privateNote ? <MarkdownView>{order.privateNote}</MarkdownView> : <p className="text-muted-foreground">No notes.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

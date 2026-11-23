"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHARGE_LABEL_MAX, CHARGES_MAX } from "@/lib/orders/details";
import { formatINR, paiseToDecimalString, toPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

import { Shell, useOrderPatch, type ModalProps } from "./order-modals";

/** A charge row as typed: the label, add (+) or take off (−, a discount), and the amount: rupees, or "18%" of the items. */
type ChargeRow = { key: number; label: string; minus: boolean; amount: string };

const PRESETS: { label: string; minus?: boolean; amount?: string }[] = [
  { label: "GST", amount: "18%" },
  { label: "Shipping" },
  { label: "Packing" },
  { label: "Discount", minus: true },
];

/** Rupees typed by a person -> paise, or null when it is not an amount (more than 2 decimals, letters). */
const rupees = (text: string): number | null => {
  const t = text.trim().replace(/,/g, "");
  if (!t) return null;
  try {
    const p = toPaise(t);
    return p >= 0 ? p : null;
  } catch {
    return null;
  }
};

/** A charge amount: "250" rupees, or "18%" of the items' total (rounded to the paisa). */
const chargePaise = (text: string, itemsPaise: number): number | null => {
  const pct = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(text);
  if (pct) return Math.round((itemsPaise * Number(pct[1])) / 100);
  return rupees(text);
};

let nextKey = 0;

/**
 * The seller's prices for a quote: each line's unit price (a price-on-request line has none yet) and extra charges
 * under the items. Sending shows them to the customer, who accepts (the order is placed) or declines. The modal shows
 * the total as it will be sent; the server works it out again and saves it.
 */
export const QuoteModal = ({ order, isOpen, onClose }: ModalProps) => {
  const again = order.quote?.state === "sent";
  const { save, loading, formError } = useOrderPatch(order, onClose, { path: "/quote", method: "PUT", done: again ? "Updated quote sent." : "Quote sent." });
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.items.map((i) => [i.productId, i.onRequest && i.pricePaise === 0 ? "" : paiseToDecimalString(i.pricePaise)])),
  );
  const [charges, setCharges] = useState<ChargeRow[]>(() =>
    order.charges.map((c) => ({ key: nextKey++, label: c.label, minus: c.amountPaise < 0, amount: paiseToDecimalString(Math.abs(c.amountPaise)) })),
  );
  const [error, setError] = useState("");

  const unit = (productId: string) => rupees(prices[productId] ?? "");
  const itemsPaise = order.items.reduce((n, i) => n + (unit(i.productId) ?? 0) * i.quantity, 0);
  const chargeValue = (c: ChargeRow) => {
    const v = chargePaise(c.amount, itemsPaise);
    return v === null ? null : c.minus ? -v : v;
  };
  const totalPaise = Math.max(0, itemsPaise + order.money.shippingPaise + charges.reduce((n, c) => n + (chargeValue(c) ?? 0), 0));

  const setCharge = (key: number, patch: Partial<ChargeRow>) => setCharges((all) => all.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const addCharge = (preset: { label: string; minus?: boolean; amount?: string } = { label: "" }) =>
    setCharges((all) => (all.length >= CHARGES_MAX ? all : [...all, { key: nextKey++, label: preset.label, minus: preset.minus ?? false, amount: preset.amount ?? "" }]));

  const send = () => {
    setError("");
    const priced: { productId: string; pricePaise: number }[] = [];
    for (const i of order.items) {
      const p = unit(i.productId);
      if (p === null || (i.onRequest && p === 0)) return setError(`Enter a price for ${i.name} (rupees, up to 2 decimals).`);
      priced.push({ productId: i.productId, pricePaise: p });
    }
    const out: { label: string; amountPaise: number }[] = [];
    for (const c of charges) {
      if (!c.label.trim() && !c.amount.trim()) continue; // an empty row is ignored
      const v = chargeValue(c);
      if (!c.label.trim()) return setError("Every charge needs a name, e.g. GST.");
      if (v === null) return setError(`Enter an amount for ${c.label.trim()}: rupees, or a percent like 18%.`);
      out.push({ label: c.label.trim(), amountPaise: v });
    }
    void save({ prices: priced, charges: out });
  };

  return (
    <Shell
      title={again ? `Change the quote for order #${order.orderNumber}` : `Quote for order #${order.orderNumber}`}
      description="The customer sees these prices on their order and can accept or decline. Accepting places the order and takes the stock."
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={error || formError}
      onSave={send}
      saveLabel={again ? "Send updated quote" : "Send quote"}
      wide
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 font-medium">Unit price (₹)</th>
              <th className="py-2 pl-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => {
              const p = unit(i.productId);
              return (
                <tr key={i.productId} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    <div className="max-w-[16rem] truncate font-medium">{i.name}</div>
                    {i.onRequest && <div className="text-xs text-muted-foreground">Price on request</div>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{i.quantity}</td>
                  <td className="px-2 py-2">
                    <Input
                      inputMode="decimal"
                      aria-label={`Unit price of ${i.name}`}
                      className={cn("h-8 w-28", prices[i.productId] && p === null && "border-destructive")}
                      placeholder="0.00"
                      value={prices[i.productId] ?? ""}
                      onChange={(e) => setPrices((all) => ({ ...all, [i.productId]: e.target.value }))}
                    />
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums">{p === null ? "–" : formatINR(p * i.quantity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Extra charges</div>
        {charges.map((c) => {
          const v = chargeValue(c);
          return (
            <div key={c.key} className="flex items-center gap-2">
              <Input
                aria-label="Charge name"
                className="h-8 min-w-0 flex-1"
                placeholder="e.g. GST"
                maxLength={CHARGE_LABEL_MAX}
                value={c.label}
                onChange={(e) => setCharge(c.key, { label: e.target.value })}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                aria-label={c.minus ? "Takes off (discount). Click to add instead" : "Adds. Click to take off instead (discount)"}
                title={c.minus ? "Takes off (discount)" : "Adds"}
                onClick={() => setCharge(c.key, { minus: !c.minus })}
              >
                {c.minus ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
              <Input
                aria-label="Amount in rupees, or a percent of the items"
                className={cn("h-8 w-24 shrink-0", c.amount && v === null && "border-destructive")}
                placeholder="₹ or %"
                value={c.amount}
                onChange={(e) => setCharge(c.key, { amount: e.target.value })}
              />
              <span className="w-24 shrink-0 text-right text-sm tabular-nums">{v === null ? "–" : formatINR(v)}</span>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Remove ${c.label || "charge"}`} onClick={() => setCharges((all) => all.filter((x) => x.key !== c.key))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        {charges.length < CHARGES_MAX && (
          <div className="flex flex-wrap gap-2">
            {PRESETS.filter((p) => !charges.some((c) => c.label.trim().toLowerCase() === p.label.toLowerCase())).map((p) => (
              <Button key={p.label} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => addCharge(p)}>
                <Plus className="mr-1 h-3 w-3" /> {p.label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addCharge()}>
              <Plus className="mr-1 h-3 w-3" /> Other
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">An amount in rupees, or a percent of the items (18% for GST). Use − for a discount.</p>
      </div>

      <div className="space-y-1 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Items</span>
          <span className="tabular-nums">{formatINR(itemsPaise)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatINR(totalPaise)}</span>
        </div>
      </div>
    </Shell>
  );
};

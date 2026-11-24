"use client";

import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { ZodProvider, fieldConfig } from "@autoform/zod";
import type { AutoFormFieldProps } from "@autoform/react";
import { Plus } from "lucide-react";

import { AutoForm } from "@/components/ui/autoform";
import { ArrayTableWrapper, type TableOptions } from "@/components/ui/autoform/components/ArrayTableWrapper";
import { Button } from "@/components/ui/button";
import { CHARGE_LABEL_MAX, CHARGES_MAX } from "@/lib/orders/details";
import { formatINR, paiseToDecimalString, toPaise } from "@/lib/money";

import { Shell, useOrderPatch, type ModalProps } from "./order-modals";

const FORM_ID = "quote-form";
const ADD = "+ Add";
const TAKE_OFF = "- Deduct";

const PRESETS: { label: string; kind?: string; amount?: string }[] = [
  { label: "GST", amount: "18%" },
  { label: "Shipping" },
  { label: "Packing" },
  { label: "Discount", kind: TAKE_OFF },
];

/** Rupees typed by a person -> paise, or null when it is not an amount (more than 2 decimals, letters). */
const rupees = (text: string | undefined): number | null => {
  const t = (text ?? "").trim().replace(/,/g, "");
  if (!t) return null;
  try {
    const p = toPaise(t);
    return p >= 0 ? p : null;
  } catch {
    return null;
  }
};

const PERCENT = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/;

/** A charge amount: "250" rupees, or "18%" of the items' total (rounded to the paisa). Signed by its kind. */
const chargePaise = (amount: string | undefined, kind: string | undefined, itemsPaise: number): number | null => {
  const pct = PERCENT.exec(amount ?? "");
  const v = pct ? Math.round((itemsPaise * Number(pct[1])) / 100) : rupees(amount);
  return v === null ? null : kind === TAKE_OFF ? -v : v;
};

type ItemRow = { productId: string; onRequest: boolean; name: string; quantity: number; price: string; line?: string };
type ChargeRow = { label: string; kind: string; amount: string; value?: string };
type QuoteValues = { items: ItemRow[]; charges: ChargeRow[] };

const itemsTotal = (items: ItemRow[] | undefined) => (items ?? []).reduce((n, i) => n + (rupees(i.price) ?? 0) * (i.quantity ?? 0), 0);

// ---------------------------------------------------------------- cells that only show a value

const cellText = "flex items-center px-2.5 text-sm";

/** The row this cell belongs to (the cell's path without its column). */
const useRow = <T,>(path: string[]) => useWatch({ name: path.slice(0, -1).join(".") }) as T | undefined;

const ItemNameCell = ({ path }: AutoFormFieldProps) => {
  const row = useRow<ItemRow>(path);
  return (
    <div className={cellText}>
      <span className="min-w-0 max-w-[14rem] truncate font-medium" title={row?.name}>
        {row?.name}
      </span>
      {row?.onRequest && <span className="ml-2 shrink-0 rounded-full border px-1.5 text-[11px] text-muted-foreground">on request</span>}
    </div>
  );
};

const QuantityCell = ({ path }: AutoFormFieldProps) => <div className={`${cellText} justify-end tabular-nums`}>{useRow<ItemRow>(path)?.quantity}</div>;

const LineTotalCell = ({ path }: AutoFormFieldProps) => {
  const row = useRow<ItemRow>(path);
  const p = rupees(row?.price);
  return <div className={`${cellText} justify-end tabular-nums`}>{p === null ? "–" : formatINR(p * (row?.quantity ?? 0))}</div>;
};

const ChargeValueCell = ({ path }: AutoFormFieldProps) => {
  const row = useRow<ChargeRow>(path);
  const items = useWatch({ name: "items" }) as ItemRow[] | undefined;
  const v = chargePaise(row?.amount, row?.kind, itemsTotal(items));
  return <div className={`${cellText} justify-end tabular-nums`}>{v === null ? "–" : formatINR(v)}</div>;
};

/** Preset charges under the table (one of each), plus an empty row. */
const ChargePresets: NonNullable<TableOptions["AddControls"]> = ({ add }) => {
  const charges = (useWatch({ name: "charges" }) as ChargeRow[] | undefined) ?? [];
  const used = new Set(charges.map((c) => (c.label ?? "").trim().toLowerCase()));
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.filter((p) => !used.has(p.label.toLowerCase())).map((p) => (
          <Button key={p.label} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => add({ label: p.label, kind: p.kind ?? ADD, amount: p.amount ?? "" })}>
            <Plus className="mr-1 h-3 w-3" /> {p.label}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => add({ label: "", kind: ADD, amount: "" })}>
          <Plus className="mr-1 h-3 w-3" /> Other
        </Button>
      </div>
    </div>
  );
};

/** Items, charges and the total, live, under the tables. */
const Totals = ({ shippingPaise }: { shippingPaise: number }) => {
  const items = useWatch({ name: "items" }) as ItemRow[] | undefined;
  const charges = (useWatch({ name: "charges" }) as ChargeRow[] | undefined) ?? [];
  const itemsPaise = itemsTotal(items);
  const total = Math.max(0, itemsPaise + shippingPaise + charges.reduce((n, c) => n + (chargePaise(c.amount, c.kind, itemsPaise) ?? 0), 0));
  return (
    <div className="space-y-1 border-t pt-3 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Items</span>
        <span className="tabular-nums">{formatINR(itemsPaise)}</span>
      </div>
      {shippingPaise > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shipping</span>
          <span className="tabular-nums">{formatINR(shippingPaise)}</span>
        </div>
      )}
      <div className="flex justify-between text-base font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatINR(total)}</span>
      </div>
    </div>
  );
};

const formComponents = { itemName: ItemNameCell, quantity: QuantityCell, lineTotal: LineTotalCell, chargeValue: ChargeValueCell };

const hidden = fieldConfig({ customData: { hidden: true } });

const quoteSchema = z.object({
  items: z
    .array(
      z
        .object({
          productId: z.string().superRefine(hidden),
          onRequest: z.boolean().superRefine(hidden),
          name: z.string().superRefine(fieldConfig({ label: "Item", fieldType: "itemName" })),
          quantity: z.number().superRefine(fieldConfig({ label: "Qty", fieldType: "quantity" })),
          price: z.string({ required_error: "Enter the price" }).superRefine(fieldConfig({ label: "Unit price (₹)", inputProps: { inputMode: "decimal", placeholder: "0.00" } })),
          line: z.string().optional().superRefine(fieldConfig({ label: "Line total", fieldType: "lineTotal" })),
        })
        // On the row, with the issue on the price cell: a price-on-request line needs a price above 0.
        .superRefine((row, ctx) => {
          const p = rupees(row.price);
          if (p === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Rupees, up to 2 decimals" });
          else if (row.onRequest && p === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Enter the price" });
        }),
    )
    .superRefine(fieldConfig({ label: "Items", arrayWrapper: ArrayTableWrapper, customData: { fixedRows: true } satisfies TableOptions })),
  charges: z
    .array(
      z.object({
        label: z
          .string({ required_error: "Name the charge" })
          .trim()
          .min(1, "Name the charge")
          .max(CHARGE_LABEL_MAX)
          .superRefine(fieldConfig({ label: "Charge", inputProps: { placeholder: "e.g. GST", maxLength: CHARGE_LABEL_MAX } })),
        kind: z.enum([ADD, TAKE_OFF]).superRefine(fieldConfig({ label: "Type" })),
        amount: z
          .string({ required_error: "Rupees, or a percent like 18%" })
          .refine((v) => PERCENT.test(v) || rupees(v) !== null, "Rupees, or a percent like 18%")
          .superRefine(fieldConfig({ label: "Amount (₹ or %)", inputProps: { placeholder: "₹ or %" } })),
        value: z.string().optional().superRefine(fieldConfig({ label: "Value", fieldType: "chargeValue" })),
      }),
    )
    .max(CHARGES_MAX)
    .superRefine(
      fieldConfig({
        label: "Extra charges",
        arrayWrapper: ArrayTableWrapper,
        customData: { maxRows: CHARGES_MAX, AddControls: ChargePresets, emptyText: "No extra charges." } satisfies TableOptions,
      }),
    ),
});

/**
 * The seller's prices for a quote: each line's unit price (a price-on-request line has none yet) and extra charges
 * under the items, as two editable tables (AutoForm + ArrayTableWrapper). Sending shows them to the customer, who
 * accepts (the order is placed) or declines. The modal shows the total as it will be sent; the server works it out
 * again and saves it.
 */
export const QuoteModal = ({ order, isOpen, onClose }: ModalProps) => {
  const again = order.quote?.state === "sent";
  const { save, loading, formError } = useOrderPatch(order, onClose, { path: "/quote", method: "PUT", done: again ? "Updated quote sent." : "Quote sent." });
  const schema = useMemo(() => new ZodProvider(quoteSchema), []);
  const defaultValues = useMemo<QuoteValues>(
    () => ({
      items: order.items.map((i) => ({
        productId: i.productId,
        onRequest: i.onRequest,
        name: i.name,
        quantity: i.quantity,
        price: i.onRequest && i.pricePaise === 0 ? "" : paiseToDecimalString(i.pricePaise),
      })),
      charges: order.charges.map((c) => ({ label: c.label, kind: c.amountPaise < 0 ? TAKE_OFF : ADD, amount: paiseToDecimalString(Math.abs(c.amountPaise)) })),
    }),
    [order],
  );

  const send = (values: QuoteValues) => {
    const itemsPaise = itemsTotal(values.items);
    void save({
      prices: values.items.map((i) => ({ productId: i.productId, pricePaise: rupees(i.price) ?? 0 })),
      charges: values.charges.map((c) => ({ label: c.label.trim(), amountPaise: chargePaise(c.amount, c.kind, itemsPaise) ?? 0 })),
    });
  };

  return (
    <Shell
      title={again ? `Change the quote for order #${order.orderNumber}` : `Quote for order #${order.orderNumber}`}
      description="The customer sees these prices on their order and can accept or decline. Accepting places the order and takes the stock."
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      formId={FORM_ID}
      saveLabel={again ? "Send updated quote" : "Send quote"}
      wide
    >
      <AutoForm schema={schema} defaultValues={defaultValues} formComponents={formComponents} formProps={{ id: FORM_ID }} onSubmit={(v) => send(v as QuoteValues)}>
        <Totals shippingPaise={order.money.shippingPaise} />
      </AutoForm>
    </Shell>
  );
};

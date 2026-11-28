"use client";

import { ArrowDown, ArrowUp, MessageCircle, Phone, ShoppingCart, Zap, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  BUTTON_TEXT_MAX,
  BUTTON_TYPES,
  HEADING_MAX,
  SIDES,
  arrangeButtons,
  buttonText,
  defaultButtonText,
  hasButton,
  takesOrders,
  type ButtonSide,
  type ButtonType,
  type ProductButtons,
  type Side,
} from "@/lib/orders/product-buttons";
import { QUOTE_BUTTON_PRESETS, QUOTE_LABEL_MAX, QUOTE_PRICE_PRESETS, type OrderSettings } from "@/lib/orders/settings";
import { cn } from "@/lib/utils";

import { EditButton, SettingRow, SettingsModal, patchSettings, useOpen } from "./setting-row";

/**
 * Settings > Orders > Product page buttons. The modal edits a grid (one row per button, one column per kind of
 * product) and saves it as `productButtons` (lib/orders/product-buttons.ts) plus the quote words (`quote`).
 */

type Show = "main" | "secondary" | "off";
type Contact = { phone: string; whatsapp: string };

/** One row of the grid. `text` starts as the stored text or the default; on save, a text equal to the default is not stored. */
type Row = { type: ButtonType; show: Record<Side, Show>; text: Record<Side, string> };
type Draft = { rows: Row[]; heading: Record<Side, string>; priceText: string; quoteButton: string };

const SIDE_NAME: Record<Side, string> = { withPrice: "With a price", withoutPrice: "Without a price" };
const TYPE: Record<ButtonType, { name: string; icon: LucideIcon }> = {
  cart: { name: "Add to cart", icon: ShoppingCart },
  buy: { name: "Buy now", icon: Zap },
  whatsapp: { name: "WhatsApp", icon: MessageCircle },
  call: { name: "Call", icon: Phone },
};

const showOf = (s: ButtonSide, type: ButtonType): Show => (s.main.includes(type) ? "main" : s.secondary.includes(type) ? "secondary" : "off");

/** Stored settings -> the grid. Row order: as the buttons appear on the page, the off ones last. */
function toDraft(b: ProductButtons, quote: OrderSettings["quote"]): Draft {
  const order = Array.from(new Set([...b.withPrice.main, ...b.withPrice.secondary, ...b.withoutPrice.main, ...b.withoutPrice.secondary, ...BUTTON_TYPES]));
  return {
    rows: order.map((type) => ({
      type,
      show: { withPrice: showOf(b.withPrice, type), withoutPrice: showOf(b.withoutPrice, type) },
      text: { withPrice: buttonText(b.withPrice, type, "withPrice", quote.button), withoutPrice: buttonText(b.withoutPrice, type, "withoutPrice", quote.button) },
    })),
    heading: { withPrice: b.withPrice.heading, withoutPrice: b.withoutPrice.heading },
    priceText: quote.priceText,
    quoteButton: quote.button,
  };
}

/** The grid -> the settings shape (the lists follow the row order). Only texts that differ from the default are kept. */
function toSide(d: Draft, side: Side): ButtonSide {
  const quoteButton = d.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
  const text: ButtonSide["text"] = {};
  for (const r of d.rows) {
    const t = r.text[side].trim().replace(/\s+/g, " ");
    if (t && t !== defaultButtonText(r.type, side, quoteButton)) text[r.type] = t;
  }
  return {
    main: d.rows.filter((r) => r.show[side] === "main").map((r) => r.type),
    secondary: d.rows.filter((r) => r.show[side] === "secondary").map((r) => r.type),
    heading: d.heading[side].trim(),
    text,
  };
}

const summarize = (b: ProductButtons) => {
  const names = (types: ButtonType[]) => types.map((t) => TYPE[t].name).join(", ");
  const s = b.withPrice;
  const parts = [s.main.length ? names(s.main) : "No main buttons"];
  if (s.secondary.length) parts.push(`${names(s.secondary)} below`);
  return parts.join(" · ");
};

// ---------------------------------------------------------------- small pieces

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: "main", label: "Main" },
  { value: "secondary", label: "Secondary" },
  { value: "off", label: "Off" },
];

/** Main / Secondary / Off as three joined buttons, as wide as the text box under it. */
const ShowPicker = ({ value, onChange, label }: { value: Show; onChange: (v: Show) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="grid w-full grid-cols-3 rounded-md border p-0.5">
    {SHOW_OPTIONS.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        onClick={() => onChange(o.value)}
        className={cn(
          "rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === o.value ? (o.value === "off" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:bg-accent",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** A few common choices as chips, or the owner's own words in the box. */
const LabelPicker = ({ id, label, help, presets, value, onChange }: { id: string; label: string; help: string; presets: string[]; value: string; onChange: (v: string) => void }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === p && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {p}
        </button>
      ))}
    </div>
    <Input id={id} maxLength={QUOTE_LABEL_MAX} value={value} placeholder={presets[0]} onChange={(e) => onChange(e.target.value)} />
    <p className="text-xs text-muted-foreground">{help}</p>
  </div>
);

/** A button as the product page draws it: Main is the big rounded one, Secondary the smaller box's button. */
const PreviewButton = ({ type, text, main }: { type: ButtonType; text: string; main: boolean }) => {
  const Icon = TYPE[type].icon;
  const wa = type === "whatsapp";
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-1.5 font-medium",
        main
          ? cn(
              "h-10 rounded-full border px-4 text-sm shadow-sm",
              wa ? "border-emerald-200 bg-emerald-50 text-emerald-800" : type === "buy" ? "border-amber-300 bg-amber-300 text-slate-900" : "border-slate-200 bg-white text-slate-900",
            )
          : cn("h-9 w-full rounded-lg border px-3 text-sm", wa ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-border bg-background text-foreground"),
      )}
    >
      <span className="truncate">{text}</span>
      <Icon className="h-4 w-4 shrink-0" />
    </span>
  );
};

const Preview = ({ draft, contact }: { draft: Draft; contact: Contact }) => {
  const [side, setSide] = useState<Side>("withPrice");
  const [outOfStock, setOutOfStock] = useState(false);
  const s = toSide(draft, side);
  const quoteButton = draft.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
  const { main, secondary } = arrangeButtons(s, { outOfStock, ...contact });
  const text = (t: ButtonType) => buttonText(s, t, side, quoteButton);
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Preview</p>
        <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Preview product">
          {SIDES.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={side === x}
              onClick={() => setSide(x)}
              className={cn("rounded px-2.5 py-1 text-xs font-medium", side === x ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-accent")}
            >
              {SIDE_NAME[x]}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-md border bg-background p-4">
        <p className="font-semibold">Sample product</p>
        <p className="mt-1 text-lg">{side === "withPrice" ? "₹1,499" : draft.priceText.trim() || QUOTE_PRICE_PRESETS[0]}</p>
        {outOfStock && <p className="mt-1 text-sm font-medium text-destructive">Out of stock</p>}
        {main.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {main.map((t) => (
              <PreviewButton key={t} type={t} text={text(t)} main />
            ))}
          </div>
        )}
        {secondary.length > 0 && (
          <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3">
            {s.heading && <p className="mb-2 text-xs font-medium text-muted-foreground">{s.heading}</p>}
            <div className={cn("grid gap-2", secondary.length > 1 && "grid-cols-2")}>
              {secondary.map((t) => (
                <PreviewButton key={t} type={t} text={text(t)} main={false} />
              ))}
            </div>
          </div>
        )}
        {main.length === 0 && secondary.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No buttons: customers cannot act on this product.</p>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="preview-oos" className="text-xs font-normal text-muted-foreground">
          Show as out of stock
        </Label>
        <Switch id="preview-oos" checked={outOfStock} onCheckedChange={setOutOfStock} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the modal

type ModalProps = { storeId: string; initial: OrderSettings; contact: Contact; onClose: () => void };

const ProductButtonsModal = ({ storeId, initial, contact, onClose }: ModalProps) => {
  const router = useRouter();
  const [d, setD] = useState(() => toDraft(initial.productButtons, initial.quote));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const quoteButton = d.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
  // Grid columns of the button table: the button's name, then one column per kind of product.
  const cols = "sm:grid-cols-2 lg:grid-cols-[11rem_1fr_1fr]";

  const setRow = (index: number, side: Side, patch: { show?: Show; text?: string }) =>
    setD((p) => ({
      ...p,
      rows: p.rows.map((r, i) =>
        i === index ? { ...r, show: patch.show ? { ...r.show, [side]: patch.show } : r.show, text: patch.text !== undefined ? { ...r.text, [side]: patch.text } : r.text } : r,
      ),
    }));
  const move = (index: number, by: -1 | 1) =>
    setD((p) => {
      const rows = [...p.rows];
      [rows[index], rows[index + by]] = [rows[index + by], rows[index]];
      return { ...p, rows };
    });

  const built = { withPrice: toSide(d, "withPrice"), withoutPrice: toSide(d, "withoutPrice") };
  const empty = SIDES.filter((s) => built[s].main.length + built[s].secondary.length === 0);
  const shownCount = (s: Side) => {
    const a = arrangeButtons(built[s], { outOfStock: false, ...contact });
    return a.main.length + a.secondary.length;
  };
  const noNumbers = SIDES.filter((s) => !empty.includes(s) && shownCount(s) === 0);
  const cartOff = SIDES.every((s) => !hasButton(built[s], "cart"));
  const ordersOff = SIDES.every((s) => !takesOrders(built[s]));
  const notes = [
    cartOff && !ordersOff && "No cart: the cart icon in the navbar and the cart page go away. If your footer links to the cart, remove that link in Pages.",
    ordersOff && "No Add to cart or Buy now: customers cannot order on the site. Payment, order statuses, cancellation and returns do not apply.",
    !ordersOff && SIDES.some((s) => !takesOrders(built[s])) && `${SIDE_NAME[SIDES.find((s) => !takesOrders(built[s]))!]}: these products cannot be ordered on the site.`,
    ...noNumbers.map((s) => `${SIDE_NAME[s]}: only WhatsApp or Call is on, and no number is saved in Contact details, so these products show no buttons.`),
  ].filter(Boolean) as string[];

  const save = async () => {
    setError("");
    setLoading(true);
    const err = await patchSettings(`/api/${storeId}/order-settings`, {
      quote: { button: d.quoteButton, priceText: d.priceText },
      productButtons: {
        // Every button is sent, so a cleared box ("") goes back to the default text.
        withPrice: { ...built.withPrice, text: Object.fromEntries(BUTTON_TYPES.map((t) => [t, built.withPrice.text[t] ?? ""])) },
        withoutPrice: { ...built.withoutPrice, text: Object.fromEntries(BUTTON_TYPES.map((t) => [t, built.withoutPrice.text[t] ?? ""])) },
      },
    });
    setLoading(false);
    if (err) return setError(err);
    toast.success("Saved.");
    router.refresh();
    onClose();
  };

  return (
    <SettingsModal
      title="Product page buttons"
      isOpen
      onClose={onClose}
      onSave={save}
      loading={loading}
      error={error || (empty.length ? `${empty.map((s) => SIDE_NAME[s]).join(" and ")}: turn on at least one button.` : "")}
      saveDisabled={empty.length > 0}
      className="sm:max-w-7xl"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Products without a price</p>
              <p className="text-xs text-muted-foreground">Words shown for products with &ldquo;Price on request&rdquo; turned on.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <LabelPicker
                id="priceText"
                label="Text in place of the price"
                help="On the product page, product cards and the cart."
                presets={QUOTE_PRICE_PRESETS}
                value={d.priceText}
                onChange={(priceText) => setD((p) => ({ ...p, priceText }))}
              />
              <LabelPicker
                id="quoteButton"
                label="Checkout button text"
                help="The button that sends the request at checkout. Also the default text of Buy now here."
                presets={QUOTE_BUTTON_PRESETS}
                value={d.quoteButton}
                onChange={(quoteButton) =>
                  setD((p) => {
                    const was = p.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
                    const next = quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
                    // Buy now (without a price) still shows the old default: it follows the new one.
                    const rows = p.rows.map((r) => (r.type === "buy" && r.text.withoutPrice.trim() === was ? { ...r, text: { ...r.text, withoutPrice: next } } : r));
                    return { ...p, quoteButton, rows };
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Secondary box heading</p>
              <p className="text-xs text-muted-foreground">Shown above the Secondary buttons. Leave empty for no heading.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {SIDES.map((side) => (
                <div key={side} className="grid gap-1.5">
                  <Label htmlFor={`heading-${side}`} className="text-xs font-normal text-muted-foreground">
                    {SIDE_NAME[side]}
                  </Label>
                  <Input
                    id={`heading-${side}`}
                    maxLength={HEADING_MAX}
                    value={d.heading[side]}
                    placeholder="No heading"
                    onChange={(e) => setD((p) => ({ ...p, heading: { ...p.heading, [side]: e.target.value } }))}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Buttons</p>
              <p className="text-xs text-muted-foreground">
                Main buttons are the big row; Secondary ones go in the smaller box under it. Use the arrows to set the order. An empty text goes back to the default.
              </p>
            </div>
            {/* Wide screens: a table (one header, one row per button). Narrow: each button stacks its cells, each with its own label. */}
            <div className="rounded-lg border">
              <div className={cn("hidden gap-4 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid", cols)}>
                <span>Button</span>
                {SIDES.map((side) => (
                  <span key={side}>{SIDE_NAME[side]}</span>
                ))}
              </div>
              <div className="divide-y">
                {d.rows.map((row, index) => {
                  const Icon = TYPE[row.type].icon;
                  const missing = (row.type === "whatsapp" && !contact.whatsapp) || (row.type === "call" && !contact.phone);
                  return (
                    <div key={row.type} className={cn("grid gap-3 p-3 lg:gap-4", cols)}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label={`Move ${TYPE[row.type].name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              aria-label={`Move ${TYPE[row.type].name} down`}
                              disabled={index === d.rows.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <Icon className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium">{TYPE[row.type].name}</span>
                        </div>
                        {missing && (
                          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                            No {row.type === "whatsapp" ? "WhatsApp" : "phone"} number in Contact details, so it will not show.
                          </p>
                        )}
                      </div>
                      {SIDES.map((side) => (
                        <div key={side} className="grid content-start gap-1.5">
                          <span className="text-xs text-muted-foreground lg:hidden">{SIDE_NAME[side]}</span>
                          <ShowPicker value={row.show[side]} onChange={(show) => setRow(index, side, { show })} label={`${TYPE[row.type].name}, ${SIDE_NAME[side].toLowerCase()}`} />
                          <Input
                            aria-label={`${TYPE[row.type].name} text, ${SIDE_NAME[side].toLowerCase()}`}
                            maxLength={BUTTON_TEXT_MAX}
                            value={row.text[side]}
                            placeholder={defaultButtonText(row.type, side, quoteButton)}
                            disabled={row.show[side] === "off"}
                            onChange={(e) => setRow(index, side, { text: e.target.value })}
                            className="h-8"
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {notes.length > 0 && (
            <ul className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <Preview draft={d} contact={contact} />
        </div>
      </div>
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- the row

/** One row in the Orders settings; Edit opens the grid. */
export const ProductButtonsRow = ({ storeId, initial, contact }: { storeId: string; initial: OrderSettings; contact: Contact }) => {
  const modal = useOpen();
  return (
    <>
      <SettingRow title="Product page buttons" summary={summarize(initial.productButtons)} action={<EditButton onClick={modal.show} label="Edit product page buttons" />} />
      {modal.open && <ProductButtonsModal storeId={storeId} initial={initial} contact={contact} onClose={modal.hide} />}
    </>
  );
};

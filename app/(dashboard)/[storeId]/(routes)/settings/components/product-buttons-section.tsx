"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, MessageCircle, Phone, ShoppingCart, Zap, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

import { FieldHelp, type HelpTopic } from "./product-buttons-help";
import { EditButton, SettingRow, SettingsModal, patchSettings, useOpen } from "./setting-row";

/**
 * Settings > Orders > Product page buttons. The modal edits one product kind at a time ("With a price" or
 * "Without a price"), synced with a live preview on the right, and saves `productButtons` + `quote`.
 */

type Show = "main" | "secondary" | "off";
type Contact = { phone: string; whatsapp: string };
type Spotlight = "price" | "heading" | ButtonType | null;

/** One button row on a single side. `text` starts as the stored text or the default; on save, default text is not stored. */
type Row = { type: ButtonType; show: Show; text: string };
type Draft = { rows: Record<Side, Row[]>; heading: Record<Side, string>; priceText: string; quoteButton: string };

const SIDE_NAME: Record<Side, string> = { withPrice: "With a price", withoutPrice: "Without a price" };
const TYPE: Record<ButtonType, { name: string; icon: LucideIcon }> = {
  cart: { name: "Add to cart", icon: ShoppingCart },
  buy: { name: "Buy now", icon: Zap },
  whatsapp: { name: "WhatsApp", icon: MessageCircle },
  call: { name: "Call", icon: Phone },
};

const showOf = (s: ButtonSide, type: ButtonType): Show => (s.main.includes(type) ? "main" : s.secondary.includes(type) ? "secondary" : "off");

function sideRows(s: ButtonSide, side: Side, quoteButton: string): Row[] {
  const order = Array.from(new Set([...s.main, ...s.secondary, ...BUTTON_TYPES]));
  return order.map((type) => ({
    type,
    show: showOf(s, type),
    text: buttonText(s, type, side, quoteButton),
  }));
}

/** Stored settings -> the tabbed editor draft. */
function toDraft(b: ProductButtons, quote: OrderSettings["quote"]): Draft {
  return {
    rows: {
      withPrice: sideRows(b.withPrice, "withPrice", quote.button),
      withoutPrice: sideRows(b.withoutPrice, "withoutPrice", quote.button),
    },
    heading: { withPrice: b.withPrice.heading, withoutPrice: b.withoutPrice.heading },
    priceText: quote.priceText,
    quoteButton: quote.button,
  };
}

/** Draft -> the settings shape for one side. Only texts that differ from the default are kept. */
function toSide(d: Draft, side: Side): ButtonSide {
  const quoteButton = d.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
  const text: ButtonSide["text"] = {};
  for (const r of d.rows[side]) {
    const t = r.text.trim().replace(/\s+/g, " ");
    if (t && t !== defaultButtonText(r.type, side, quoteButton)) text[r.type] = t;
  }
  return {
    main: d.rows[side].filter((r) => r.show === "main").map((r) => r.type),
    secondary: d.rows[side].filter((r) => r.show === "secondary").map((r) => r.type),
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

/** Calm 3-way segmented control: Main / Secondary / Off. */
const ShowPicker = ({ value, onChange, label }: { value: Show; onChange: (v: Show) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="inline-grid grid-cols-3 rounded-md border bg-muted/40 p-0.5">
    {SHOW_OPTIONS.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? o.value === "off"
                ? "bg-background/80 text-muted-foreground shadow-sm"
                : "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

/** Clean text input with a compact Presets dropdown and an info-mockup popover. */
const PresetInput = ({
  id,
  label,
  helpTopic,
  presets,
  value,
  onChange,
  onSpotlight,
}: {
  id: string;
  label: string;
  helpTopic: HelpTopic;
  presets: string[];
  value: string;
  onChange: (v: string) => void;
  onSpotlight?: (active: boolean) => void;
}) => (
  <div className="space-y-1.5" onMouseEnter={() => onSpotlight?.(true)} onMouseLeave={() => onSpotlight?.(false)}>
    <div className="flex items-center gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <FieldHelp topic={helpTopic} value={value} />
    </div>
    <div className="flex gap-1.5">
      <Input
        id={id}
        maxLength={QUOTE_LABEL_MAX}
        value={value}
        placeholder={presets[0]}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => onSpotlight?.(true)}
        onBlur={() => onSpotlight?.(false)}
        className="h-9"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1 px-2.5 text-xs font-normal text-muted-foreground">
            Presets
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {presets.map((p) => (
            <DropdownMenuItem key={p} onClick={() => onChange(p)} className="justify-between text-xs">
              <span>{p}</span>
              {value === p && <Check className="h-3.5 w-3.5 text-foreground" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
);

/** A button as the product page draws it: Main is the big rounded one, Secondary the smaller box's button. */
const PreviewButton = ({ type, text, main, highlighted }: { type: ButtonType; text: string; main: boolean; highlighted: boolean }) => {
  const Icon = TYPE[type].icon;
  const wa = type === "whatsapp";
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-1.5 font-medium transition-shadow",
        main
          ? cn(
              "h-10 rounded-full border px-4 text-sm shadow-sm",
              wa ? "border-emerald-200 bg-emerald-50 text-emerald-800" : type === "buy" ? "border-amber-300 bg-amber-300 text-slate-900" : "border-slate-200 bg-white text-slate-900",
            )
          : cn("h-9 w-full rounded-lg border px-3 text-sm", wa ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-border bg-background text-foreground"),
        highlighted && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background",
      )}
    >
      <span className="truncate">{text}</span>
      <Icon className="h-4 w-4 shrink-0" />
    </span>
  );
};

const Preview = ({ draft, side, contact, spotlight }: { draft: Draft; side: Side; contact: Contact; spotlight: Spotlight }) => {
  const [outOfStock, setOutOfStock] = useState(false);
  const s = toSide(draft, side);
  const quoteButton = draft.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
  const { main, secondary } = arrangeButtons(s, { outOfStock, ...contact });
  const text = (t: ButtonType) => buttonText(s, t, side, quoteButton);
  const showHeadingSlot = Boolean(s.heading) || spotlight === "heading";

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Preview</p>
        <span className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">{SIDE_NAME[side]}</span>
      </div>
      <div className="rounded-md border bg-background p-4">
        <p className="font-semibold">Sample product</p>
        <p
          className={cn(
            "mt-1 inline-block rounded text-lg transition-all",
            spotlight === "price" && "bg-sky-500/10 px-1.5 -mx-1.5 ring-2 ring-sky-500/80",
          )}
        >
          {side === "withPrice" ? "₹1,499" : draft.priceText.trim() || QUOTE_PRICE_PRESETS[0]}
        </p>
        {outOfStock && <p className="mt-1 text-sm font-medium text-destructive">Out of stock</p>}
        {main.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {main.map((t) => (
              <PreviewButton key={t} type={t} text={text(t)} main highlighted={spotlight === t} />
            ))}
          </div>
        )}
        {secondary.length > 0 && (
          <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3">
            {showHeadingSlot && (
              <p
                className={cn(
                  "mb-2 inline-block rounded text-xs font-medium text-muted-foreground transition-all",
                  spotlight === "heading" && "bg-sky-500/10 px-1.5 py-0.5 -mx-1.5 text-foreground ring-2 ring-sky-500/80",
                  !s.heading && "italic",
                )}
              >
                {s.heading || "No heading"}
              </p>
            )}
            <div className={cn("grid gap-2", secondary.length > 1 && "grid-cols-2")}>
              {secondary.map((t) => (
                <PreviewButton key={t} type={t} text={text(t)} main={false} highlighted={spotlight === t} />
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
  const [side, setSide] = useState<Side>("withPrice");
  const [spotlight, setSpotlight] = useState<Spotlight>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const quoteButton = d.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];

  const setRow = (index: number, patch: { show?: Show; text?: string }) =>
    setD((p) => ({
      ...p,
      rows: {
        ...p.rows,
        [side]: p.rows[side].map((r, i) => (i === index ? { ...r, ...patch } : r)),
      },
    }));

  const move = (index: number, by: -1 | 1) =>
    setD((p) => {
      const next = [...p.rows[side]];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return { ...p, rows: { ...p.rows, [side]: next } };
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

  const hasSecondary = built[side].secondary.length > 0;

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
      className="sm:max-w-6xl"
    >
      {/* Single product-type switcher synced with both the editor and the live preview. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div role="tablist" aria-label="Product type" className="inline-flex rounded-lg border bg-muted/40 p-1">
          {SIDES.map((s) => {
            const active = side === s;
            const hasErr = empty.includes(s);
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSide(s);
                  setSpotlight(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SIDE_NAME[s]}
                {hasErr && <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {side === "withPrice" ? "For standard products that display a price." : 'For products with "Price on request" turned on.'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="min-w-0 space-y-5">
          {side === "withoutPrice" && (
            <div className="grid gap-4 rounded-lg border bg-muted/15 p-4 sm:grid-cols-2">
              <PresetInput
                id="priceText"
                label="Text in place of the price"
                helpTopic="priceText"
                presets={QUOTE_PRICE_PRESETS}
                value={d.priceText}
                onChange={(priceText) => setD((p) => ({ ...p, priceText }))}
                onSpotlight={(on) => setSpotlight(on ? "price" : null)}
              />
              <PresetInput
                id="quoteButton"
                label="Checkout button text"
                helpTopic="quoteButton"
                presets={QUOTE_BUTTON_PRESETS}
                value={d.quoteButton}
                onChange={(quoteButton) =>
                  setD((p) => {
                    const was = p.quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
                    const next = quoteButton.trim() || QUOTE_BUTTON_PRESETS[0];
                    // Buy now (without a price) still shows the old default: it follows the new one.
                    const withoutPrice = p.rows.withoutPrice.map((r) => (r.type === "buy" && r.text.trim() === was ? { ...r, text: next } : r));
                    return { ...p, quoteButton, rows: { ...p.rows, withoutPrice } };
                  })
                }
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Buttons</p>
              <p className="text-xs text-muted-foreground">Clear a label to restore default.</p>
            </div>
            <div className="divide-y rounded-lg border">
              {d.rows[side].map((row, index) => {
                const Icon = TYPE[row.type].icon;
                const isOff = row.show === "off";
                const missing = !isOff && ((row.type === "whatsapp" && !contact.whatsapp) || (row.type === "call" && !contact.phone));
                return (
                  <div
                    key={row.type}
                    onMouseEnter={() => !isOff && setSpotlight(row.type)}
                    onMouseLeave={() => setSpotlight((cur) => (cur === row.type ? null : cur))}
                    className="space-y-1.5 px-3 py-2.5 transition-colors hover:bg-muted/20"
                  >
                    <div className="grid items-center gap-3 sm:grid-cols-[10.5rem_auto_minmax(0,1fr)]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div className="flex shrink-0">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            aria-label={`Move ${TYPE[row.type].name} up`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            aria-label={`Move ${TYPE[row.type].name} down`}
                            disabled={index === d.rows[side].length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Icon className={cn("h-4 w-4 shrink-0 text-muted-foreground", isOff && "opacity-50")} />
                        <span className={cn("truncate text-sm font-medium", isOff && "text-muted-foreground")}>{TYPE[row.type].name}</span>
                      </div>
                      <ShowPicker value={row.show} onChange={(show) => setRow(index, { show })} label={`${TYPE[row.type].name}, ${SIDE_NAME[side].toLowerCase()}`} />
                      <Input
                        aria-label={`${TYPE[row.type].name} text, ${SIDE_NAME[side].toLowerCase()}`}
                        maxLength={BUTTON_TEXT_MAX}
                        value={row.text}
                        placeholder={defaultButtonText(row.type, side, quoteButton)}
                        disabled={isOff}
                        onChange={(e) => setRow(index, { text: e.target.value })}
                        onFocus={() => setSpotlight(row.type)}
                        onBlur={() => setSpotlight((cur) => (cur === row.type ? null : cur))}
                        className={cn("h-8 text-sm", isOff && "opacity-45")}
                      />
                    </div>
                    {missing && (
                      <p className="pl-14 text-xs text-amber-700 dark:text-amber-400">
                        No {row.type === "whatsapp" ? "WhatsApp" : "phone"} number in Contact details, so it will not show.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className={cn("space-y-1.5 transition-opacity", !hasSecondary && "opacity-55")}
            onMouseEnter={() => hasSecondary && setSpotlight("heading")}
            onMouseLeave={() => setSpotlight((cur) => (cur === "heading" ? null : cur))}
          >
            <div className="flex items-center gap-1.5">
              <Label htmlFor={`heading-${side}`} className="text-sm font-medium">
                Secondary box heading
              </Label>
              <FieldHelp topic="secondaryHeading" value={d.heading[side]} />
            </div>
            <Input
              id={`heading-${side}`}
              maxLength={HEADING_MAX}
              value={d.heading[side]}
              disabled={!hasSecondary}
              placeholder={hasSecondary ? "No heading" : "Set a button to Secondary to use a heading"}
              onChange={(e) => setD((p) => ({ ...p, heading: { ...p.heading, [side]: e.target.value } }))}
              onFocus={() => setSpotlight("heading")}
              onBlur={() => setSpotlight((cur) => (cur === "heading" ? null : cur))}
              className="h-9"
            />
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
          <Preview draft={d} side={side} contact={contact} spotlight={spotlight} />
        </div>
      </div>
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- the row

/** One row in the Orders settings; Edit opens the modal. */
export const ProductButtonsRow = ({ storeId, initial, contact }: { storeId: string; initial: OrderSettings; contact: Contact }) => {
  const modal = useOpen();
  return (
    <>
      <SettingRow title="Product page buttons" summary={summarize(initial.productButtons)} action={<EditButton onClick={modal.show} label="Edit product page buttons" />} />
      {modal.open && <ProductButtonsModal storeId={storeId} initial={initial} contact={contact} onClose={modal.hide} />}
    </>
  );
};

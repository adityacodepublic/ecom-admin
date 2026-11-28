import { z } from "zod";

import { OrderError } from "./errors";

/**
 * Store.settings.orders.productButtons: the buttons on a product page.
 *
 *   withPrice      the buttons of a product with a price
 *   withoutPrice   the buttons of a product without one (price null)
 *
 * Each side: `main` (the big row) and `secondary` (the smaller box under it) list button types in their order on the
 * page. A type in neither list is off. `heading` is the secondary box's heading ("" = none). `text` holds only the
 * button texts the owner changed; a missing type uses the default text (buttonText below).
 *
 * The store has a copy of `arrangeButtons` and `buttonText` (next13-ecommerce-store lib/product-buttons.ts): keep
 * them the same.
 */

export const BUTTON_TYPES = ["cart", "buy", "whatsapp", "call"] as const;
export type ButtonType = (typeof BUTTON_TYPES)[number];
export type Side = "withPrice" | "withoutPrice";
export const SIDES: Side[] = ["withPrice", "withoutPrice"];

export const BUTTON_TEXT_MAX = 24;
export const HEADING_MAX = 40;

export type ButtonSide = {
  main: ButtonType[];
  secondary: ButtonType[];
  heading: string;
  text: Partial<Record<ButtonType, string>>;
};
export type ProductButtons = Record<Side, ButtonSide>;

/** Today's store: Add to cart and Buy now in the big row, WhatsApp and Call in the box under it. */
export const DEFAULT_HEADINGS: Record<Side, string> = { withPrice: "Bulk order or questions?", withoutPrice: "Prefer to ask directly?" };
const defaultSide = (side: Side): ButtonSide => ({ main: ["cart", "buy"], secondary: ["whatsapp", "call"], heading: DEFAULT_HEADINGS[side], text: {} });
export const DEFAULT_PRODUCT_BUTTONS: ProductButtons = { withPrice: defaultSide("withPrice"), withoutPrice: defaultSide("withoutPrice") };

/** The text a button shows when the owner has not changed it. Buy now on a product without a price uses the quote button text. */
export const defaultButtonText = (type: ButtonType, side: Side, quoteButton: string) =>
  type === "cart" ? "Add To Cart" : type === "buy" ? (side === "withPrice" ? "Buy Now" : quoteButton) : type === "whatsapp" ? "WhatsApp" : "Call";

export const buttonText = (s: ButtonSide, type: ButtonType, side: Side, quoteButton: string) => s.text[type] || defaultButtonText(type, side, quoteButton);

/** Buttons that place an order (through the checkout). Without one on a side, that side cannot be ordered on the site. */
export const ORDER_BUTTONS: ButtonType[] = ["cart", "buy"];
export const takesOrders = (s: ButtonSide) => [...s.main, ...s.secondary].some((t) => ORDER_BUTTONS.includes(t));
export const hasButton = (s: ButtonSide, type: ButtonType) => s.main.includes(type) || s.secondary.includes(type);

/**
 * What a product page shows: the big row and the secondary box, in order. WhatsApp and Call need their number.
 * Out of stock, Add to cart and Buy now go away (the checkout refuses the product, a quote request too), and if the big
 * row is then empty, the secondary buttons move up into it.
 */
export function arrangeButtons(s: ButtonSide, o: { outOfStock: boolean; whatsapp: string; phone: string }) {
  const usable = (t: ButtonType) => (t === "whatsapp" ? !!o.whatsapp : t === "call" ? !!o.phone : !o.outOfStock);
  let main = s.main.filter(usable);
  let secondary = s.secondary.filter(usable);
  if (o.outOfStock && main.length === 0) [main, secondary] = [secondary, []];
  return { main, secondary };
}

// ---------------------------------------------------------------- validation

const typeList = z.array(z.enum(BUTTON_TYPES)).max(BUTTON_TYPES.length).transform((a) => Array.from(new Set(a)));
const textValue = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().max(BUTTON_TEXT_MAX, `A button text is at most ${BUTTON_TEXT_MAX} characters`));
const textMap = z.object(Object.fromEntries(BUTTON_TYPES.map((t) => [t, textValue.optional()])) as Record<ButtonType, z.ZodOptional<typeof textValue>>).strict();
const heading = z.string().trim().max(HEADING_MAX, `The heading is at most ${HEADING_MAX} characters`);

/** "" text = the default: dropped, so `text` keeps only real changes. */
const cleanText = (t: Partial<Record<ButtonType, string | undefined>>) =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => v)) as Partial<Record<ButtonType, string>>;

/** A button is in one list only. */
function checkSide(s: ButtonSide, ctx: z.RefinementCtx) {
  const both = s.main.filter((t) => s.secondary.includes(t));
  if (both.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A button is either main or secondary, not both: ${both.join(", ")}` });
}

export const buttonSidePatchSchema = z.object({ main: typeList.optional(), secondary: typeList.optional(), heading: heading.optional(), text: textMap.optional() }).strict();
export const productButtonsPatchSchema = z
  .object({ withPrice: buttonSidePatchSchema.optional(), withoutPrice: buttonSidePatchSchema.optional() })
  .strict();
export type ProductButtonsPatch = z.infer<typeof productButtonsPatchSchema>;

/** Patch onto the current settings: each side merges, `text` merges per button ("" resets one). Throws OrderError VALIDATION. */
export function mergeProductButtons(current: ProductButtons, patch: ProductButtonsPatch | undefined): ProductButtons {
  if (!patch) return current;
  const side = (name: Side): ButtonSide => {
    const c = current[name];
    const p = patch[name];
    if (!p) return c;
    return { main: p.main ?? c.main, secondary: p.secondary ?? c.secondary, heading: p.heading ?? c.heading, text: cleanText({ ...c.text, ...p.text }) };
  };
  const next: ProductButtons = { withPrice: side("withPrice"), withoutPrice: side("withoutPrice") };
  const r = productButtonsSchema.safeParse(next);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const where = issue?.path[0] === "withoutPrice" ? "Without a price: " : issue?.path[0] === "withPrice" ? "With a price: " : "";
  throw new OrderError("VALIDATION", `${where}${issue?.message ?? "Invalid buttons"}`, r.error.flatten());
}

const sideSchema = (name: Side) =>
  z
    .object({
      main: typeList.default(defaultSide(name).main),
      secondary: typeList.default(defaultSide(name).secondary),
      heading: heading.default(DEFAULT_HEADINGS[name]), // "" stays "" (no heading)
      text: textMap.default({}).transform(cleanText),
    })
    .superRefine(checkSide);

/** Every product page needs at least one button. */
export const productButtonsSchema = z
  .object({
    withPrice: sideSchema("withPrice").default({}),
    withoutPrice: sideSchema("withoutPrice").default({}),
  })
  .superRefine((b, ctx) => {
    for (const side of SIDES) {
      if (b[side].main.length + b[side].secondary.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [side], message: "Turn on at least one button" });
    }
  });

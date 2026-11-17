/**
 * Exact money. The database keeps rupees as Decimal(12,2); code works in whole paise (integers).
 * Never multiply a float by 100 and never parseInt a price: go through these helpers.
 *
 *   toPaise(product.price)        Decimal 19.99   -> 1999
 *   toPaise("19.99")              string          -> 1999
 *   lineTotalPaise(1999, 3)                       -> 5997
 *   paiseToDecimalString(5997)                    -> "59.97"   (write this to a Decimal column)
 *   formatINR(123456789)                          -> "₹12,34,567.89"
 *
 * Plain functions only (no Prisma import), so the store app can copy this file as it is.
 */

/** The largest amount we accept: Decimal(12,2) holds up to 9,999,999,999.99 rupees. */
export const MAX_PAISE = 999_999_999_999;

const MONEY_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Something with an exact decimal string form: Prisma.Decimal, a string like "19.99", or a number. */
export type MoneyInput = { toFixed(dp?: number): string } | string | number;

/**
 * Rupees -> integer paise, exactly. Decimals are read through their string form, never through a float.
 * Throws on more than 2 decimals, on anything that is not a number, and on values that are too big.
 */
export function toPaise(value: MoneyInput): number {
  let text: string;
  if (typeof value === "string") text = value.trim();
  else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Not a money amount: ${value}`);
    text = String(value);
  } else text = value.toFixed(2); // Prisma.Decimal: exact, and Decimal(12,2) has at most 2 decimals anyway
  const m = MONEY_RE.exec(text);
  if (!m) throw new Error(`Not a money amount with at most 2 decimals: ${text}`);
  const rupees = Number(m[2]);
  const paise = Number((m[3] ?? "").padEnd(2, "0"));
  const total = rupees * 100 + paise; // both are integers, so this is exact while it is a safe integer
  if (!Number.isSafeInteger(total) || total > MAX_PAISE) throw new Error(`Money amount too big: ${text}`);
  return m[1] ? -total : total;
}

/** Throws unless n is a whole number of paise in the allowed range. */
export function assertPaise(n: number): number {
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_PAISE) throw new Error(`Not a valid paise amount: ${n}`);
  return n;
}

/** unit price x quantity, in paise. */
export function lineTotalPaise(unitPaise: number, quantity: number): number {
  if (!Number.isSafeInteger(quantity)) throw new Error(`Quantity must be a whole number: ${quantity}`);
  return assertPaise(assertPaise(unitPaise) * quantity);
}

/** Adds paise amounts. */
export function sumPaise(values: number[]): number {
  return assertPaise(values.reduce((sum, v) => sum + assertPaise(v), 0));
}

/** Integer paise -> "1234.50" (exact; for writing a Decimal(12,2) column or for an input field). */
export function paiseToDecimalString(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Integer paise -> "₹12,34,567.89" (Indian digit grouping). For display only. */
export function formatINR(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = new Intl.NumberFormat("en-IN").format(Math.floor(abs / 100));
  return `${sign}₹${rupees}.${String(abs % 100).padStart(2, "0")}`;
}

import type { Lookups } from "./lookups";

export type RequestLike = { method: string; path: string; query?: unknown; body?: unknown };

export type Summary = {
  /** "Update product “Blue Shirt”" */
  title: string;
  /** What kind of data is touched, e.g. "Product". */
  subject: string;
  destructive: boolean;
  /** Key fields in plain words. The full body is always shown separately. */
  fields: [label: string, value: string][];
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const quote = (s: string) => `“${s}”`;

const SINGULAR: Record<string, string> = {
  products: "product",
  categories: "category",
  filters: "filter",
  media: "media image",
  orders: "order",
};

const LABELS: Record<string, string> = {
  name: "Name",
  label: "Label",
  price: "Price (₹)",
  quantity: "Quantity in stock",
  maxQuantity: "Max per order",
  isFeatured: "Featured",
  isArchived: "Archived",
  description: "Description",
  imageUrl: "Thumbnail",
  logo: "Logo",
  logoOnly: "Only the logo in the header",
  url: "Image link",
  source: "Source",
  status: "Status",
  paymentStatus: "Payment status",
  payment: "Payment method",
  expectedDelivery: "Expected delivery",
  privateNote: "Private note",
};

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

function plain(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v === null) return "(cleared)";
  if (typeof v === "string") return v === "" ? "(empty)" : clip(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  return "see details below";
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function summarize(r: RequestLike, lookups: Lookups = {}): Summary {
  const [feature = "", id = ""] = r.path.split("/").filter(Boolean);
  const body = isObject(r.body) ? r.body : {};
  const noun = SINGULAR[feature] ?? feature.replace(/-/g, " ");
  const named = (fallbackId: string, name?: string) => (name ? quote(name) : fallbackId ? quote(fallbackId) : "");
  const fields: [string, string][] = [];
  const add = (label: string, value: unknown) => {
    if (value !== undefined) fields.push([label, plain(value)]);
  };

  // Whole-object features with no id.
  if (feature === "page-layouts") {
    const pageName = id === "category" ? "category page" : id === "product" ? "product page" : "home page";
    if (Array.isArray(r.body)) {
      fields.push(["Blocks", r.body.length === 0 ? "none (empty page)" : count(r.body.length, "block")]);
      const types = r.body.map((s) => (isObject(s) && typeof s.type === "string" ? s.type : "?"));
      if (types.length) fields.push(["Order", types.join(", ")]);
    }
    return { title: r.method === "DELETE" ? `Reset ${pageName} layout` : `Replace ${pageName} layout`, subject: `${pageName[0].toUpperCase()}${pageName.slice(1)} layout`, destructive: r.method === "DELETE", fields };
  }
  if (feature === "contact" || feature === "order-settings" || feature === "branding") {
    const subject = feature === "contact" ? "Contact details" : feature === "branding" ? "Store name and logo" : "Order settings";
    for (const [k, v] of Object.entries(body)) add(LABELS[k] ?? k, v);
    return { title: `Change ${subject.toLowerCase()}`, subject, destructive: r.method === "DELETE", fields };
  }

  let title: string;
  if (feature === "orders" && id && r.method !== "POST") {
    const ref = lookups.orderNumber !== undefined ? `#${lookups.orderNumber}` : id.startsWith("#") ? id : `“${id}”`;
    const parts: string[] = [];
    if (typeof body.status === "string") parts.push(`status to ${body.status}`);
    if (typeof body.paymentStatus === "string") parts.push(`payment status to ${body.paymentStatus.replace(/_/g, " ").toLowerCase()}`);
    title = parts.length ? `Change order ${ref} ${parts.join(" and ")}` : `Update order ${ref}`;
  } else if (r.method === "POST") {
    title = `Create a ${noun}`;
  } else if (r.method === "DELETE") {
    title = `Delete ${noun} ${named(id, lookups.targetName)}`.trim();
  } else {
    title = `Update ${noun} ${named(id, lookups.targetName)}`.trim();
  }

  // Key fields, in human labels.
  if (feature === "products") {
    add("Name", body.name);
    add("Price (₹)", body.price);
    add("Quantity in stock", body.quantity);
    add("Max per order", body.maxQuantity);
    if (body.categoryId !== undefined) add("Category", lookups.categoryName ?? `id ${String(body.categoryId)}`);
    add("Featured", body.isFeatured);
    add("Archived", body.isArchived);
    if (Array.isArray(body.images)) fields.push(["Images", count(body.images.length, "image")]);
    if (Array.isArray(body.filteritems)) fields.push(["Attributes", count(body.filteritems.length, "attribute")]);
    if (typeof body.description === "string") fields.push(["Description", clip(body.description)]);
  } else if (feature === "categories") {
    add("Name", body.name);
    add("Thumbnail", body.imageUrl);
    if (Array.isArray(body.banner)) fields.push(["Billboard", count(body.banner.length, "image")]);
  } else if (feature === "filters") {
    add("Name", body.name);
    if (Array.isArray(body.value)) fields.push(["Values", count(body.value.length, "value")]);
  } else {
    for (const [k, v] of Object.entries(body)) add(LABELS[k] ?? k, v);
  }
  if (feature === "orders") {
    for (const k of ["status", "paymentStatus", "payment", "expectedDelivery", "privateNote"]) add(LABELS[k], body[k]);
  }

  return { title, subject: noun.charAt(0).toUpperCase() + noun.slice(1), destructive: r.method === "DELETE", fields };
}

/** "page=1&x=2" -> [["page","1"],["x","2"]] */
export function parseQuery(query: unknown): [string, string][] {
  if (typeof query !== "string" || !query) return [];
  const out: [string, string][] = [];
  new URLSearchParams(query.replace(/^\?/, "")).forEach((v, k) => out.push([k, v]));
  return out;
}

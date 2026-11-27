import { z } from "zod";

// The layouts of the store pages (home, category, product, and the owner's custom pages): each is an ordered list
// of blocks. Array order = page order. All are stored in Store.pageLayouts = { home, category, product, custom }
// (a missing home, category or product = that page's default; custom = { "<route>": blocks }, one per custom page).
// This file is the same in the admin and the store repo. Change both together.

/** In a products query (product list or custom component), `categoryId: "current"` means the category of the page it sits on. */
export const CURRENT_CATEGORY = "current";

// Which products a product block shows. `search` works like the store search box
// (price phrases such as "under 20000" and category words such as "phone" are understood).
const productQuery = {
  categoryId: z.string().optional().describe("Category"),
  featuredOnly: z.boolean().default(false).describe("Featured products only"),
  search: z.string().optional().describe("Search words (optional, like the store search)"),
};

// ---- Billboard images: a carousel block keeps its own images; a category keeps its own (Category.banner).

/** One billboard image: the picture and where a click on it goes (a store path such as /category/<id>, a full URL, or "" = nowhere). */
export const billboardImageSchema = z.object({
  url: z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i, "Image url must start with http:// or https://"),
  href: z.string().trim().max(2000).default(""),
  width: z.coerce.number().int().positive().max(20_000).optional(),
  height: z.coerce.number().int().positive().max(20_000).optional(),
});
export type BillboardImage = z.infer<typeof billboardImageSchema>;
export const BILLBOARD_IMAGES_MAX = 20;

const ASPECT_RATIO_RE = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/;

/** Validates a billboard aspect ratio like "16:9" or "2.4:1" (width/height between 0.3 and 8) and normalizes to "W:H". */
export const aspectRatioSchema = z
  .string()
  .trim()
  .refine((v) => {
    const m = ASPECT_RATIO_RE.exec(v);
    if (!m) return false;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
    const r = w / h;
    return r >= 0.3 && r <= 8;
  }, "Enter a valid ratio like 16:9 or 2.4:1 (between 0.3:1 and 8:1)")
  .transform((v) => {
    const m = ASPECT_RATIO_RE.exec(v)!;
    return `${m[1]}:${m[2]}`;
  });

/** Turns "16:9" into CSS "16 / 9", or undefined if missing/invalid. */
export function toCssAspectRatio(ratio?: string): string | undefined {
  if (!ratio) return undefined;
  const m = ASPECT_RATIO_RE.exec(ratio.trim());
  return m ? `${m[1]} / ${m[2]}` : undefined;
}
/** The images of a billboard, in order. */
export const billboardImagesSchema = z.array(billboardImageSchema).max(BILLBOARD_IMAGES_MAX, `${BILLBOARD_IMAGES_MAX} images at most`);

// ---- Custom component: the agent's own HTML, shown on the store in a sandboxed frame (opaque origin, so it can
// never read the shopper's session or cart). It cannot call any API, so the data it needs is declared in `data`
// and injected as window.STORE_DATA. Same shape as T3 Code's html_render: a self-contained page + a height.
export const CUSTOM_HTML_MAX = 300_000;
/** The longest text of a Markdown block. */
export const MARKDOWN_MAX = 100_000;

/**
 * How Markdown looks: one spec for both sides. The store renders Markdown with these styles
 * (components/ui/markdown.tsx: product descriptions and Markdown blocks), and the admin's Markdown block
 * editor builds its CSS from them (pages/components/markdown-style.tsx), so the editor looks like the store.
 * Property names are React style names (camelCase). Change a value here, then copy this file to the other repo.
 */
const MD_BORDER = "#e5e5e5";
const MD_MUTED_BG = "#f5f5f5";
const MD_CELL = { height: "36px", padding: "8px 12px", fontSize: "14px", lineHeight: "20px", border: `1px solid ${MD_BORDER}` }; // height: a minimum, so an empty row keeps it
export const MARKDOWN_STYLE = {
  root: { color: "#0a0a0a" }, // the whole Markdown text (the store's text colour)
  h1: { margin: "1.5rem 0 0.75rem", padding: 0, fontSize: "1.5rem", lineHeight: "2rem", fontWeight: 700 },
  h2: { margin: "1.5rem 0 0.75rem", padding: 0, fontSize: "1.25rem", lineHeight: "1.75rem", fontWeight: 700 },
  h3: { margin: "1.25rem 0 0.5rem", padding: 0, fontSize: "1.125rem", lineHeight: "1.75rem", fontWeight: 600 },
  h4: { margin: "1rem 0 0.5rem", padding: 0, fontSize: "1rem", lineHeight: "1.5rem", fontWeight: 600 },
  p: { margin: "0.75rem 0", padding: 0, fontSize: "1rem", lineHeight: "1.75rem" },
  ul: { margin: "0.75rem 0", paddingLeft: "1.5rem", listStyleType: "disc" },
  ol: { margin: "0.75rem 0", paddingLeft: "1.5rem", listStyleType: "decimal" },
  li: { margin: "0.25rem 0", lineHeight: "1.625rem" },
  a: { color: "#2563eb", textDecoration: "underline" },
  blockquote: { margin: "1rem 0", padding: "0 0 0 1rem", borderLeft: `4px solid ${MD_BORDER}`, color: "#737373", lineHeight: "1.75rem" },
  hr: { margin: "1.5rem 0", border: 0, borderTop: `1px solid ${MD_BORDER}` },
  pre: { margin: "1rem 0", padding: "1rem", borderRadius: "0.5rem", background: MD_MUTED_BG, fontSize: "0.875rem", overflowX: "auto" },
  code: { padding: "0.125rem 0.25rem", borderRadius: "0.25rem", background: MD_MUTED_BG, fontSize: "0.875rem" },
  img: { margin: "1rem 0", maxWidth: "100%", height: "auto", borderRadius: "0.5rem" },
  table: { margin: "1rem 0", width: "100%", borderCollapse: "collapse" },
  th: { ...MD_CELL, background: MD_MUTED_BG, fontWeight: 600, textAlign: "left" },
  td: MD_CELL,
} as const;
/** Injected data above this many bytes is refused (the page would get slow): lower the limits. */
export const CUSTOM_DATA_MAX_BYTES = 200_000;
export const CUSTOM_DATA_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
// The frame is sized to its content, so a viewport unit (vh) would make the page grow with its own frame.
const VIEWPORT_UNIT = /\d\s*(?:[sld]?vh)\b/i;
// Tailwind's screen-height classes (h-screen, min-h-dvh, ...) are vh too.
const VIEWPORT_CLASS = /(?:^|[\s"'`:])(?:min-|max-)?h-(?:screen|[sld]vh)(?![\w-])/;

export const dataQuerySchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("products"),
    ...productQuery,
    limit: z.coerce.number().int().min(1).max(50).default(12).describe("Number of products (1-50)"),
  }),
  z.object({ source: z.literal("categories") }),
]);
export type DataQuery = z.infer<typeof dataQuerySchema>;

export const DEFAULT_ASPECT_RATIO = { desktop: "2.4:1", mobile: "2:1" } as const;

export const billboardAspectRatioSchema = z
  .object({
    desktop: aspectRatioSchema.optional(),
    mobile: aspectRatioSchema.optional(),
  })
  .optional();
export type BillboardAspectRatio = z.infer<typeof billboardAspectRatioSchema>;

const carouselDisplaySettings = {
  slides: z.coerce.number().int().min(1).max(3).default(1).describe("Slides shown at once (1-3)"),
  aspectRatio: billboardAspectRatioSchema.default(DEFAULT_ASPECT_RATIO).describe("Aspect ratio"),
  fill: z.boolean().default(false).describe("Fill image"),
  fullWidth: z.boolean().default(false).describe("Full width"),
  rounded: z.boolean().default(true).describe("Rounded corners"),
  autoplay: z.boolean().default(true).describe("Play automatically"),
};

export const sectionSettingsSchemas = {
  // ---- blocks any page can use, as often as wanted; everything about them is set in the block
  carousel: z.object({
    title: z.string().optional().describe("Title (optional)"),
    images: billboardImagesSchema.min(1, "Add at least one image").describe("Images"),
    ...carouselDisplaySettings,
  }),
  productList: z.object({
    title: z.string().min(1, "Title is required").describe("Title"),
    ...productQuery,
    limit: z.coerce.number().int().min(1).max(24).default(8).describe("Number of products (1-24)"),
    grid: z.boolean().default(false).describe("Grid style: big image tiles instead of product cards"),
    columns: z.coerce.number().int().min(2).max(3).default(2).describe("Grid style: columns (2 or 3)"),
    showName: z.boolean().default(true).describe("Grid style: show the product name"),
    showPrice: z.boolean().default(false).describe("Grid style: show the price"),
  }),
  markdown: z.object({
    markdown: z.string().trim().min(1, "Write some text").max(MARKDOWN_MAX, "The text is too long (100,000 characters at most)").describe("Markdown"),
  }),
  custom: z.object({
    title: z.string().optional().describe("Name (only shown in the admin)"),
    height: z.coerce.number().int().min(80).max(2000).default(400).describe("Starting height (px)"),
    html: z
      .string()
      .min(1, "HTML is required")
      .max(CUSTOM_HTML_MAX, "HTML is too large (300,000 characters at most; an agent request is capped at 400 KB)")
      .refine((h) => !VIEWPORT_UNIT.test(h) && !VIEWPORT_CLASS.test(h), "Do not use vh units (or the h-screen and dvh classes): the frame is sized to the content. Use px, rem or %.")
      .describe("HTML, with Tailwind classes or inline <style>, and <script>"),
    data: z
      .record(z.string().regex(CUSTOM_DATA_NAME, "Data names: letters, digits, _ (start with a letter, 32 at most)"), dataQuerySchema)
      .default({})
      .refine((d) => !("store" in d), 'The data name "store" is reserved')
      .refine((d) => Object.keys(d).length <= 10, "At most 10 data queries")
      .describe("Named data queries, available as STORE_DATA.<name>"),
  }),
  // ---- fixed blocks: they show the store's own data, which is edited elsewhere in the admin. Once per page.
  categories: z.object({}), // home: the category icons (each category's name and thumbnail)
  categoryBanner: z.object(carouselDisplaySettings), // category page: the billboard of the category being shown (images set in the category's form; display settings here)
  categoryProducts: z.object({}), // category page: the filters and the grid of the category's products
  productTop: z.object({}), // product page: image carousel, name, price, quantity and the buy buttons
  productDescription: z.object({}), // product page: the product's Markdown description
  relatedProducts: z.object({
    title: z.string().min(1, "Title is required").default("Related Items").describe("Title"),
  }), // product page: other products of the same category (only the title is set in the block)
};

export type SectionType = keyof typeof sectionSettingsSchemas;

export const sectionTypeLabels: Record<SectionType, string> = {
  carousel: "Billboard",
  productList: "Product list",
  markdown: "Markdown",
  custom: "Custom component",
  categories: "Category icons",
  categoryBanner: "Category billboard",
  categoryProducts: "Category filters and product grid",
  productTop: "Product details (images, name, price, buy buttons)",
  productDescription: "Product description",
  relatedProducts: "Related products",
};

/** Fixed blocks show the store's own data (edited elsewhere in the admin). Each can be used once per page. */
export const FIXED_TYPES = ["categories", "categoryBanner", "categoryProducts", "productTop", "productDescription", "relatedProducts"] as const;
export type FixedType = (typeof FIXED_TYPES)[number];
export const isFixedType = (type: string): type is FixedType => (FIXED_TYPES as readonly string[]).includes(type);

const sectionSchema = <T extends SectionType>(type: T) =>
  z.object({
    id: z.string().min(1),
    type: z.literal(type),
    settings: sectionSettingsSchemas[type],
  });

// ---- pages

export const PAGES = ["home", "category", "product"] as const;
export type PageName = (typeof PAGES)[number];
/** A built-in page, or "custom": any of the owner's custom pages (they all hold the same kinds of blocks). */
export type PageKind = PageName | "custom";
export const pageLabels: Record<PageName, string> = { home: "Home", category: "Category page", product: "Product page" };

/** What each page can hold: its fixed blocks (once each), then the blocks any page can use (any number of times). */
export const pageSectionTypes: Record<PageKind, SectionType[]> = {
  home: ["categories", "carousel", "productList", "markdown", "custom"],
  category: ["categoryBanner", "categoryProducts", "carousel", "productList", "markdown", "custom"],
  product: ["productTop", "productDescription", "relatedProducts", "carousel", "productList", "markdown", "custom"],
  custom: ["carousel", "productList", "markdown", "custom"],
};

/** Custom data names the page itself fills in (STORE_DATA.category on the category page, STORE_DATA.product on the product page). */
export const pageReservedDataNames: Record<PageKind, string[]> = { home: [], category: ["category"], product: ["product"], custom: [] };

const anyPageSections = [sectionSchema("carousel"), sectionSchema("productList"), sectionSchema("markdown"), sectionSchema("custom")] as const;
export const homeSectionSchema = z.discriminatedUnion("type", [sectionSchema("categories"), ...anyPageSections]);
export const categorySectionSchema = z.discriminatedUnion("type", [
  sectionSchema("categoryBanner"),
  sectionSchema("categoryProducts"),
  ...anyPageSections,
]);
export const productSectionSchema = z.discriminatedUnion("type", [
  sectionSchema("productTop"),
  sectionSchema("productDescription"),
  sectionSchema("relatedProducts"),
  ...anyPageSections,
]);

type AnySection = { type: string; settings: unknown };

/** Fixed blocks at most once; custom components may not use the data names the page fills in. */
const checkPage = (page: PageKind) => (sections: AnySection[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  sections.forEach((s, i) => {
    if (s.type === "custom") {
      const names = Object.keys((s.settings as { data?: Record<string, unknown> }).data ?? {});
      for (const reserved of pageReservedDataNames[page]) {
        if (names.includes(reserved)) ctx.addIssue({ code: "custom", path: [i, "settings", "data", reserved], message: `The data name "${reserved}" is filled in by the ${page} page itself` });
      }
    } else if (isFixedType(s.type)) {
      if (seen.has(s.type)) ctx.addIssue({ code: "custom", path: [i, "type"], message: `"${s.type}" is a fixed block and can be used once on the ${page} page` });
      seen.add(s.type);
    }
  });
};

export const homeLayoutSchema = z.array(homeSectionSchema).superRefine(checkPage("home"));
export const categoryLayoutSchema = z.array(categorySectionSchema).superRefine(checkPage("category"));
export const productLayoutSchema = z.array(productSectionSchema).superRefine(checkPage("product"));

export const customSectionSchema = z.discriminatedUnion("type", [...anyPageSections]);
export const customPageLayoutSchema = z.array(customSectionSchema).superRefine(checkPage("custom"));

export const pageLayoutSchemas = { home: homeLayoutSchema, category: categoryLayoutSchema, product: productLayoutSchema } as const;
/** The layout schema of any page kind. */
export const layoutSchemaFor = (kind: PageKind) => (kind === "custom" ? customPageLayoutSchema : pageLayoutSchemas[kind]);

// ---- custom pages: extra store pages at their own route (/<route>), holding the blocks any page can use.

/**
 * Routes a custom page cannot take: the store's own pages (and their sub-pages, such as /product/<id>),
 * the store's utility routes, and names the admin API uses next to the pages (page-layouts/data).
 */
export const RESERVED_ROUTES = [
  "home", "cart", "category", "product", "products", "search", "checkout", "orders", "user-profile",
  "sign-in", "sign-up", "preview", "api", "s", "data", "custom",
];
export const CUSTOM_PAGES_MAX = 30;
const ROUTE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What the owner typed, as a route: "/Summer-Sale/" -> "summer-sale". */
export const normalizeRoute = (raw: string) => raw.trim().replace(/^\/+|\/+$/g, "").toLowerCase();

/** Why a (normalized) route cannot be used, or null. Whether another custom page already has it is checked separately. */
export const routeProblem = (route: string): string | null => {
  if (!route) return "Enter a route, for example summer-sale";
  if (route.includes("/")) return "Use a single word or words joined by hyphens, without /. For example: summer-sale";
  if (route.length > 40) return "Use 40 characters at most";
  if (!ROUTE_RE.test(route)) return "Use lowercase letters, digits and hyphens only. For example: summer-sale";
  if (RESERVED_ROUTES.includes(route)) return `/${route} is used by the store itself. Pick another route.`;
  return null;
};

export const routeTakenMessage = (route: string) => `/${route} is already a page of this store. Pick another route.`;

/** A new custom page's route, as sent by the admin or an agent. */
export const customRouteSchema = z
  .string()
  .transform(normalizeRoute)
  .superRefine((route, ctx) => {
    const problem = routeProblem(route);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomeLayout = z.infer<typeof homeLayoutSchema>;
export type CategorySection = z.infer<typeof categorySectionSchema>;
export type ProductSection = z.infer<typeof productSectionSchema>;
export type CustomPageSection = z.infer<typeof customSectionSchema>;
/** A block of any page. */
export type PageSection = HomeSection | CategorySection | ProductSection;
export type PageLayout = PageSection[];
export type SectionSettings<T extends SectionType> = z.infer<(typeof sectionSettingsSchemas)[T]>;

/** What a page shows while no layout is saved. */
export const defaultLayouts: { home: HomeLayout; category: CategorySection[]; product: ProductSection[] } = {
  home: [{ id: "categories", type: "categories", settings: {} }],
  category: [
    { id: "banner", type: "categoryBanner", settings: sectionSettingsSchemas.categoryBanner.parse({}) },
    { id: "products", type: "categoryProducts", settings: {} },
  ],
  product: [
    { id: "top", type: "productTop", settings: {} },
    { id: "description", type: "productDescription", settings: {} },
    { id: "related", type: "relatedProducts", settings: { title: "Related Items" } },
  ],
};

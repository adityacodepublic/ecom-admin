import { z } from "zod";

// The layouts of the store pages (home, category, product): each is an ordered list of sections. Array order = page order.
// This file is the same in the admin and the store repo. Change both together.

// Which products a product section shows. `search` works like the store search box
// (price phrases such as "under 20000" and category words such as "phone" are understood).
const productQuery = {
  categoryId: z.string().optional().describe("Category"),
  featuredOnly: z.boolean().default(false).describe("Featured products only"),
  search: z.string().optional().describe("Search words (optional, like the store search)"),
};

/** In a custom component's products query, `categoryId: "current"` means the category of the page it sits on. */
export const CURRENT_CATEGORY = "current";

// ---- Custom component: the agent's own HTML, shown on the store in a sandboxed frame (opaque origin, so it can
// never read the shopper's session or cart). It cannot call any API, so the data it needs is declared in `data`
// and injected as window.STORE_DATA. Same shape as T3 Code's html_render: a self-contained page + a height.
export const CUSTOM_HTML_MAX = 300_000;
/** Injected data above this many bytes is refused (the page would get slow): lower the limits. */
export const CUSTOM_DATA_MAX_BYTES = 200_000;
export const CUSTOM_DATA_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
// The frame is sized to its content, so a viewport unit (vh) would make the page grow with its own frame.
const VIEWPORT_UNIT = /\d\s*(?:[sld]?vh)\b/i;

export const dataQuerySchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("products"),
    ...productQuery,
    limit: z.coerce.number().int().min(1).max(50).default(12).describe("Number of products (1-50)"),
  }),
  z.object({ source: z.literal("categories") }),
  z.object({ source: z.literal("billboards") }),
]);
export type DataQuery = z.infer<typeof dataQuerySchema>;

export const sectionSettingsSchemas = {
  // ---- home page
  categories: z.object({}),
  carousel: z.object({
    title: z.string().optional().describe("Title (optional)"),
    billboardId: z.string().min(1, "Choose a billboard").describe("Billboard"),
    slides: z.coerce.number().int().min(1).max(3).default(1).describe("Slides shown at once (1-3)"),
    contain: z.boolean().default(false).describe("Show the whole image (no crop)"),
    autoplay: z.boolean().default(true).describe("Play automatically"),
  }),
  productList: z.object({
    title: z.string().min(1, "Title is required").describe("Title"),
    ...productQuery,
    limit: z.coerce.number().int().min(1).max(24).default(8).describe("Number of products"),
  }),
  productGrid: z.object({
    title: z.string().min(1, "Title is required").describe("Title"),
    ...productQuery,
    columns: z.coerce.number().int().min(2).max(3).default(2).describe("Columns (2 or 3)"),
    rows: z.coerce.number().int().min(1).max(6).default(2).describe("Rows"),
    showName: z.boolean().default(true).describe("Show product name"),
    showPrice: z.boolean().default(false).describe("Show price"),
  }),
  // ---- category page
  categoryBanner: z.object({}), // the category's billboard
  categoryProducts: z.object({}), // the filters and the grid of the category's products
  // ---- product page
  productTop: z.object({}), // image carousel, name, price, quantity and the buy buttons
  productDescription: z.object({}), // the product's Markdown description
  relatedProducts: z.object({
    title: z.string().min(1, "Title is required").default("Related Items").describe("Title"),
  }),
  // ---- any page
  custom: z.object({
    title: z.string().optional().describe("Name (only shown in the admin)"),
    height: z.coerce.number().int().min(80).max(2000).default(400).describe("Starting height (px)"),
    html: z
      .string()
      .min(1, "HTML is required")
      .max(CUSTOM_HTML_MAX, "HTML is too large (300,000 characters at most; an agent request is capped at 400 KB)")
      .refine((h) => !VIEWPORT_UNIT.test(h), "Do not use vh units: the frame is sized to the content. Use px, rem or %.")
      .describe("HTML, with inline <style> and <script>"),
    data: z
      .record(z.string().regex(CUSTOM_DATA_NAME, "Data names: letters, digits, _ (start with a letter, 32 at most)"), dataQuerySchema)
      .default({})
      .refine((d) => !("store" in d), 'The data name "store" is reserved')
      .describe("Named data queries, available as STORE_DATA.<name>"),
  }),
};

export type SectionType = keyof typeof sectionSettingsSchemas;

export const sectionTypeLabels: Record<SectionType, string> = {
  categories: "Category icons",
  carousel: "Billboard carousel",
  productList: "Product list",
  productGrid: "Product grid",
  categoryBanner: "Category billboard",
  categoryProducts: "Filters and product grid",
  productTop: "Product image, name, price and buy buttons",
  productDescription: "Product description",
  relatedProducts: "Related products",
  custom: "Custom component",
};

const sectionSchema = <T extends SectionType>(type: T) =>
  z.object({
    id: z.string().min(1),
    type: z.literal(type),
    settings: sectionSettingsSchemas[type],
  });

// ---- pages

export const PAGES = ["home", "category", "product"] as const;
export type PageName = (typeof PAGES)[number];
export const pageLabels: Record<PageName, string> = { home: "Home", category: "Category page", product: "Product page" };

/** What each page can hold. On the category and product pages each built-in block can be used once; `custom` any number of times. */
export const pageSectionTypes: Record<PageName, SectionType[]> = {
  home: ["categories", "carousel", "productList", "productGrid", "custom"],
  category: ["categoryBanner", "categoryProducts", "custom"],
  product: ["productTop", "productDescription", "relatedProducts", "custom"],
};

/** Custom data names the page itself fills in (STORE_DATA.category on the category page, STORE_DATA.product on the product page). */
export const pageReservedDataNames: Record<PageName, string[]> = { home: [], category: ["category"], product: ["product"] };

export const homeSectionSchema = z.discriminatedUnion("type", [
  sectionSchema("categories"),
  sectionSchema("carousel"),
  sectionSchema("productList"),
  sectionSchema("productGrid"),
  sectionSchema("custom"),
]);
export const categorySectionSchema = z.discriminatedUnion("type", [
  sectionSchema("categoryBanner"),
  sectionSchema("categoryProducts"),
  sectionSchema("custom"),
]);
export const productSectionSchema = z.discriminatedUnion("type", [
  sectionSchema("productTop"),
  sectionSchema("productDescription"),
  sectionSchema("relatedProducts"),
  sectionSchema("custom"),
]);

type AnySection = { type: string; settings: unknown };

/** Built-in blocks at most once; custom components may not use the names the page fills in. */
const checkPage = (page: PageName) => (sections: AnySection[], ctx: z.RefinementCtx) => {
  if (page === "home") return;
  const seen = new Set<string>();
  sections.forEach((s, i) => {
    if (s.type === "custom") {
      const names = Object.keys((s.settings as { data?: Record<string, unknown> }).data ?? {});
      for (const reserved of pageReservedDataNames[page]) {
        if (names.includes(reserved)) ctx.addIssue({ code: "custom", path: [i, "settings", "data", reserved], message: `The data name "${reserved}" is filled in by the ${page} page itself` });
      }
    } else if (seen.has(s.type)) {
      ctx.addIssue({ code: "custom", path: [i, "type"], message: `"${s.type}" can be used once on the ${page} page` });
    } else seen.add(s.type);
  });
};

export const homeLayoutSchema = z.array(homeSectionSchema);
export const categoryLayoutSchema = z.array(categorySectionSchema).superRefine(checkPage("category"));
export const productLayoutSchema = z.array(productSectionSchema).superRefine(checkPage("product"));

export const pageLayoutSchemas = { home: homeLayoutSchema, category: categoryLayoutSchema, product: productLayoutSchema } as const;

export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomeLayout = z.infer<typeof homeLayoutSchema>;
export type CategorySection = z.infer<typeof categorySectionSchema>;
export type ProductSection = z.infer<typeof productSectionSchema>;
/** A section of any page. */
export type PageSection = HomeSection | CategorySection | ProductSection;
export type PageLayout = PageSection[];
export type SectionSettings<T extends SectionType> = z.infer<(typeof sectionSettingsSchemas)[T]>;

/** What a page shows while no layout is saved: the page as it was before it was customizable. */
export const defaultLayouts: { home: HomeLayout; category: CategorySection[]; product: ProductSection[] } = {
  home: [{ id: "categories", type: "categories", settings: {} }],
  category: [
    { id: "banner", type: "categoryBanner", settings: {} },
    { id: "products", type: "categoryProducts", settings: {} },
  ],
  product: [
    { id: "top", type: "productTop", settings: {} },
    { id: "description", type: "productDescription", settings: {} },
    { id: "related", type: "relatedProducts", settings: { title: "Related Items" } },
  ],
};

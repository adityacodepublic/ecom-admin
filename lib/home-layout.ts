import { z } from "zod";

// The layouts of the store pages (home, category, product): each is an ordered list of blocks. Array order = page order.
// All three are stored in Store.pageLayouts = { home, category, product } (a missing page = that page's default).
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
});
export type BillboardImage = z.infer<typeof billboardImageSchema>;
export const BILLBOARD_IMAGES_MAX = 20;
/** The images of a billboard, in order. */
export const billboardImagesSchema = z.array(billboardImageSchema).max(BILLBOARD_IMAGES_MAX, `${BILLBOARD_IMAGES_MAX} images at most`);

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
]);
export type DataQuery = z.infer<typeof dataQuerySchema>;

export const sectionSettingsSchemas = {
  // ---- blocks any page can use, as often as wanted; everything about them is set in the block
  carousel: z.object({
    title: z.string().optional().describe("Title (optional)"),
    images: billboardImagesSchema.min(1, "Add at least one image").describe("Images"),
    slides: z.coerce.number().int().min(1).max(3).default(1).describe("Slides shown at once (1-3)"),
    contain: z.boolean().default(false).describe("Show the whole image (no crop)"),
    autoplay: z.boolean().default(true).describe("Play automatically"),
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
  // ---- fixed blocks: they show the store's own data, which is edited elsewhere in the admin. Once per page.
  categories: z.object({}), // home: the category icons (each category's name and thumbnail)
  categoryBanner: z.object({}), // category page: the billboard of the category being shown (set in the category's form)
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
export const pageLabels: Record<PageName, string> = { home: "Home", category: "Category page", product: "Product page" };

/** What each page can hold: its fixed blocks (once each), then the blocks any page can use (any number of times). */
export const pageSectionTypes: Record<PageName, SectionType[]> = {
  home: ["categories", "carousel", "productList", "custom"],
  category: ["categoryBanner", "categoryProducts", "carousel", "productList", "custom"],
  product: ["productTop", "productDescription", "relatedProducts", "carousel", "productList", "custom"],
};

/** Custom data names the page itself fills in (STORE_DATA.category on the category page, STORE_DATA.product on the product page). */
export const pageReservedDataNames: Record<PageName, string[]> = { home: [], category: ["category"], product: ["product"] };

const anyPageSections = [sectionSchema("carousel"), sectionSchema("productList"), sectionSchema("custom")] as const;
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
const checkPage = (page: PageName) => (sections: AnySection[], ctx: z.RefinementCtx) => {
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

export const pageLayoutSchemas = { home: homeLayoutSchema, category: categoryLayoutSchema, product: productLayoutSchema } as const;

export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomeLayout = z.infer<typeof homeLayoutSchema>;
export type CategorySection = z.infer<typeof categorySectionSchema>;
export type ProductSection = z.infer<typeof productSectionSchema>;
/** A block of any page. */
export type PageSection = HomeSection | CategorySection | ProductSection;
export type PageLayout = PageSection[];
export type SectionSettings<T extends SectionType> = z.infer<(typeof sectionSettingsSchemas)[T]>;

/** What a page shows while no layout is saved. */
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

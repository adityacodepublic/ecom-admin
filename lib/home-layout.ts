import { z } from "zod";

// The store home page layout: an ordered list of sections. Array order = page order.
// This file is the same in the admin and the store repo. Change both together.

// Which products a product section shows. `search` works like the store search box
// (price phrases such as "under 20000" and category words such as "phone" are understood).
const productQuery = {
  categoryId: z.string().optional().describe("Category"),
  featuredOnly: z.boolean().default(false).describe("Featured products only"),
  search: z.string().optional().describe("Search words (optional, like the store search)"),
};

export const sectionSettingsSchemas = {
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
};

export type SectionType = keyof typeof sectionSettingsSchemas;

export const sectionTypeLabels: Record<SectionType, string> = {
  categories: "Category icons",
  carousel: "Billboard carousel",
  productList: "Product list",
  productGrid: "Product grid",
};

const sectionSchema = <T extends SectionType>(type: T) =>
  z.object({
    id: z.string().min(1),
    type: z.literal(type),
    settings: sectionSettingsSchemas[type],
  });

export const homeSectionSchema = z.discriminatedUnion("type", [
  sectionSchema("categories"),
  sectionSchema("carousel"),
  sectionSchema("productList"),
  sectionSchema("productGrid"),
]);

export const homeLayoutSchema = z.array(homeSectionSchema);

export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomeLayout = z.infer<typeof homeLayoutSchema>;
export type SectionSettings<T extends SectionType> = z.infer<(typeof sectionSettingsSchemas)[T]>;

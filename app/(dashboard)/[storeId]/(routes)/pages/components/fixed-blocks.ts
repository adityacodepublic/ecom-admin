import type { FixedType } from "@/lib/home-layout";

/** Where the content of a fixed block is edited. `item` is the category / product the page is previewed with. */
export function fixedBlockInfo(type: FixedType, storeId: string, item?: { id: string; label: string }) {
  const at = (path: string) => `/${storeId}${path}`;
  const categoryLinks = [
    ...(item ? [{ label: `Edit category “${item.label}”`, href: at(`/categories/${item.id}`) }] : []),
    { label: "All categories", href: at("/categories") },
  ];
  const productLinks = [
    ...(item ? [{ label: `Edit product “${item.label}”`, href: at(`/products/${item.id}`) }] : []),
    { label: "All products", href: at("/products") },
  ];
  const info: Record<FixedType, { text: string; links: { label: string; href: string }[] }> = {
    categories: {
      text: "Shows every category with its name and thumbnail. Add categories, rename them or change their thumbnails in Categories.",
      links: [{ label: "Open Categories", href: at("/categories") }],
    },
    categoryBanner: {
      text: "Shows the billboard of the category being shown. Each category has its own billboard images, set in that category's form.",
      links: categoryLinks,
    },
    categoryProducts: {
      text: "Shows the filters and the products of the category being shown. A product's category is set in its form; filter names and values in Filters.",
      links: [
        { label: "Open Products", href: at("/products") },
        { label: "Open Filters", href: at("/filters") },
      ],
    },
    productTop: {
      text: "Shows the images, name, price, stock and buy buttons of the product being shown. All of it is set in the product's form.",
      links: productLinks,
    },
    productDescription: {
      text: "Shows the product's description (Markdown), written in the product's form. Nothing is shown for a product without one.",
      links: productLinks,
    },
    relatedProducts: {
      text: "Shows other products of the same category (nothing when there are none). Only the title is set here.",
      links: [],
    },
  };
  return info[type];
}

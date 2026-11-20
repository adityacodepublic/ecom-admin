import { MARKDOWN_STYLE } from "@/lib/home-layout";

/**
 * The CSS that makes the Markdown block editor (Milkdown) look like the store: built from the shared spec
 * MARKDOWN_STYLE (lib/home-layout.ts), the same values the store's components/ui/markdown.tsx renders with.
 * Scoped to the Pages editor (.markdown-store); the product form's editor keeps the admin look.
 */
const SCOPE = ".markdown-store .milkdown .ProseMirror";

// Milkdown draws its own list bullets and indent, so the store's list markers and indent are left out.
const SKIP: Partial<Record<string, string[]>> = { ul: ["listStyleType", "paddingLeft"], ol: ["listStyleType", "paddingLeft"] };

const UNITLESS = new Set(["fontWeight", "lineHeight", "opacity", "zIndex"]);
const cssName = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const cssValue = (key: string, value: string | number) =>
  typeof value === "number" && value !== 0 && !UNITLESS.has(key) ? `${value}px` : String(value);

const rules = Object.entries(MARKDOWN_STYLE)
  .map(([element, style]) => {
    const body = Object.entries(style as Record<string, string | number>)
      .filter(([key]) => !SKIP[element]?.includes(key))
      .map(([key, value]) => `${cssName(key)}:${cssValue(key, value)}`)
      .join(";");
    // "root" is the whole text: the editor itself.
    return `${element === "root" ? SCOPE : `${SCOPE} ${element}`}{${body}}`;
  })
  .join("\n");

// Milkdown wraps the text of a table cell and of a list item in a <p>: it takes the cell's or item's size, no margins.
const CSS = `${rules}
${SCOPE} th p,${SCOPE} td p,${SCOPE} li p{margin:0;padding:0;font-size:inherit;line-height:inherit}`;

export const MarkdownStoreStyle = () => <style>{CSS}</style>;

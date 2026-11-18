"use client";

import { useEffect, useMemo, useState } from "react";

import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sectionSettingsSchemas, type SectionSettings } from "@/lib/home-layout";

const DATA_EXAMPLE = `{
  "deals": { "source": "products", "search": "under 2000", "limit": 8 },
  "newest": { "source": "products", "categoryId": "<category id>", "featuredOnly": true, "limit": 6 },
  "cats": { "source": "categories" },
  "banners": { "source": "billboards" }
}`;

/** What the Data box accepts and what each name gives the HTML. Opens on click (also works on touch screens). */
const DataHelp = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label="Show the shape of the data" className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Info className="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(32rem,90vw)] space-y-3 text-xs">
      <p>
        Each name below becomes a list in the HTML: <code>STORE_DATA.&lt;name&gt;</code>. <code>STORE_DATA.store</code> ({"{"} name, home {"}"}) is always there.
      </p>
      <div className="space-y-2">
        <p>
          <b>products</b>: <code>categoryId</code>, <code>featuredOnly</code> (false), <code>search</code> (like the store search box: &quot;under 2000&quot;, &quot;phone&quot;), <code>limit</code> 1 to 50 (12).
          <br />
          Each item: <code>id, name, price, priceText, image, images[], url, category {"{"}id, name{"}"}, featured, inStock, quantity, description</code>
        </p>
        <p>
          <b>categories</b>: no options. Each item: <code>id, name, image, url</code>
        </p>
        <p>
          <b>billboards</b>: no options. Each item: <code>id, label, images [{"{"} url, href {"}"}]</code>
        </p>
      </div>
      <p className="font-medium">Example</p>
      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-2 font-mono text-[11px] leading-snug">{DATA_EXAMPLE}</pre>
      <p className="text-muted-foreground">Names: letters, digits and _ (up to 32). At most about 200 KB of data in total.</p>
    </PopoverContent>
  </Popover>
);

interface CustomFormProps {
  settings: Record<string, unknown>;
  saving: boolean;
  /** Every valid change, so the preview follows the form before it is saved. */
  onChange: (settings: Record<string, unknown>) => void;
  onSave: (settings: Record<string, unknown>) => void;
  onCancel: () => void;
}

const Textarea = ({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={`w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
    {...props}
  />
);

/** The custom component: a name, a starting height, the HTML and the data it asks for (JSON). */
export const CustomForm = ({ settings, saving, onChange, onSave, onCancel }: CustomFormProps) => {
  const initial = settings as Partial<SectionSettings<"custom">>;
  const [title, setTitle] = useState(initial.title ?? "");
  const [height, setHeight] = useState(String(initial.height ?? 400));
  const [html, setHtml] = useState(initial.html ?? "");
  const [dataText, setDataText] = useState(JSON.stringify(initial.data ?? {}, null, 2));

  const result = useMemo(() => {
    let data: unknown;
    try {
      data = JSON.parse(dataText.trim() || "{}");
    } catch {
      return { error: "Data is not valid JSON." };
    }
    const parsed = sectionSettingsSchemas.custom.safeParse({ title: title || undefined, height, html, data });
    if (parsed.success) return { settings: parsed.data };
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(".") || "Settings"}: ${issue.message}` };
  }, [title, height, html, dataText]);

  const valid = "settings" in result ? result.settings : null;
  useEffect(() => {
    if (valid) onChange(valid);
  }, [valid, onChange]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(valid);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <label className="grid gap-1 text-sm font-medium">
          Name (only shown here)
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Starting height (px)
          <Input type="number" min={80} max={2000} value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        HTML (inline &lt;style&gt; and &lt;script&gt;; no vh units)
        <Textarea className="min-h-56 font-mono text-xs" spellCheck={false} value={html} onChange={(e) => setHtml(e.target.value)} />
      </label>
      <div className="grid gap-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <label htmlFor="custom-data">Data (JSON), available in the HTML as STORE_DATA.&lt;name&gt;</label>
          <DataHelp />
        </div>
        <Textarea id="custom-data" className="min-h-32 font-mono text-xs" spellCheck={false} value={dataText} onChange={(e) => setDataText(e.target.value)} />
      </div>
      {"error" in result && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{result.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !valid}>
          Save
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

"use client";

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useController, useFormContext } from "react-hook-form";
import { z } from "zod";
import { ZodProvider, fieldConfig } from "@autoform/zod";
import type { AutoFormFieldProps } from "@autoform/react";

import { AutoForm } from "@/components/ui/autoform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BillboardImagesField } from "@/components/billboard-images-field";
import { CURRENT_CATEGORY, sectionSettingsSchemas, type PageKind, type SectionType } from "@/lib/home-layout";
import { CodeField, dataQueriesField, type Option } from "./data-queries-field";
import { MarkdownStoreStyle } from "./markdown-style";

export type { Option };


interface SectionFormProps {
  /** The page the section is on (a custom component's data options depend on it). */
  page: PageKind;
  type: SectionType;
  settings: Record<string, unknown>;
  categories: Option[];
  saving: boolean;
  /** Every change, so the preview can follow the form before it is saved. */
  onChange: (settings: Record<string, unknown>) => void;
  onSave: (settings: Record<string, unknown>) => void;
  onCancel: () => void;
}

const NONE = "__none";

/** A select over a fixed option list. `optional` adds a "None" choice that clears the value. */
const optionsField = (options: Option[], optional: boolean) => {
  const OptionsField = ({ id, error }: AutoFormFieldProps) => {
    const { field } = useController({ name: id });
    return (
      <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}>
        <SelectTrigger id={id} className={error ? "border-destructive" : ""}>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>None</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };
  return OptionsField;
};

// The same visual Markdown editor as the product description (browser only).
const MarkdownEditor = dynamic(() => import("@/components/ui/markdown-editor"), {
  ssr: false,
  loading: () => <div className="h-40 rounded-md border bg-muted/30" />,
});

/** The text of a Markdown block, in the visual Markdown editor, styled like the store (the shared spec, see markdown-style.tsx). */
const MarkdownField = ({ id, error }: AutoFormFieldProps) => {
  const { field } = useController({ name: id });
  return (
    <div className={`markdown-store ${error ? "rounded-md ring-1 ring-destructive" : ""}`}>
      <MarkdownStoreStyle />
      <MarkdownEditor value={field.value ?? ""} onChange={field.onChange} />
    </div>
  );
};

/** The images of a Billboard block: a strip and a button that opens the billboard image editor. */
const ImagesField = ({ id, error }: AutoFormFieldProps) => {
  const { field } = useController({ name: id });
  return <BillboardImagesField value={field.value ?? []} onChange={field.onChange} invalid={!!error} />;
};

/** Side-by-side optional Desktop + Mobile height inputs; empty clears to undefined (falls back to default aspect ratio). */
const HeightPairField = ({ error }: AutoFormFieldProps) => {
  const { field: desktop } = useController({ name: "height" });
  const { field: mobile, fieldState: mobileState } = useController({ name: "mobileHeight" });
  const mobileError = mobileState.error?.message;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="height" className="text-xs text-muted-foreground">
          Desktop (px)
        </Label>
        <Input
          id="height"
          type="number"
          min={160}
          max={900}
          placeholder="Auto (2.4:1)"
          className={error ? "border-destructive" : ""}
          value={desktop.value ?? ""}
          onChange={(e) => desktop.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mobileHeight" className="text-xs text-muted-foreground">
          Mobile (px)
        </Label>
        <Input
          id="mobileHeight"
          type="number"
          min={120}
          max={700}
          placeholder="Auto (2:1)"
          className={mobileError ? "border-destructive" : ""}
          value={mobile.value ?? ""}
          onChange={(e) => mobile.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {mobileError && <p className="text-sm text-destructive">{mobileError}</p>}
      </div>
    </div>
  );
};

const HiddenField = () => null;

/** The settings schema of a type, with the id fields shown as pickers. */
const formSchema = (type: SectionType) => {
  if (type === "custom") {
    // The HTML is a code box and the data is a row editor (data-queries-field.tsx).
    const custom = sectionSettingsSchemas.custom;
    return custom.extend({
      title: custom.shape.title.superRefine(fieldConfig({ label: "Name", description: "Only shown here in the admin." })),
      height: custom.shape.height.superRefine(fieldConfig({ label: "Starting height (px)", description: "The frame then fits the content on its own." })),
      html: custom.shape.html.superRefine(
        fieldConfig({ fieldType: "code", label: "HTML", description: "Inline <style> and <script>. Do not use vh units (the frame fits the content)." }),
      ),
      data: custom.shape.data.superRefine(fieldConfig({ fieldType: "dataQueries", label: "Data" })),
    });
  }
  const schema = sectionSettingsSchemas[type] as z.AnyZodObject;
  const fields = Object.fromEntries(
    Object.entries(schema.shape as Record<string, z.ZodTypeAny>).map(([key, field]) => {
      const { label, description } = FIELD_TEXT[key] ?? { label: field.description ?? key };
      return [key, field.superRefine(fieldConfig({ label, description, ...(FIELD_TYPE[key] && { fieldType: FIELD_TYPE[key] }) }))];
    }),
  );
  return schema.extend(fields);
};

/** Labels and help of the block settings (Billboard, Product list, Related products). */
const FIELD_TEXT: Record<string, { label: string; description?: string }> = {
  title: { label: "Title" },
  markdown: { label: "Text", description: "Headings, lists, links, images and tables. Shown on the store as formatted text." },
  images: { label: "Images", description: "In order. Each image can link to a store page or a website." },
  slides: { label: "Slides shown at once", description: "1 to 3." },
  naturalSize: {
    label: "Use image size (no crop)",
    description: "Keep each image's own aspect ratio (capped at custom height or 76% screen height) instead of fitting into a 2:1 / 2.4:1 banner.",
  },
  height: {
    label: "Custom height (optional)",
    description: "Desktop: 160–900 px; Mobile: 120–700 px. Leave either empty to keep its default aspect ratio (or use as max height when Use image size is on).",
  },
  mobileHeight: { label: "Mobile height (px)" },
  fullWidth: { label: "Full width (edge to edge)", description: "Stretch across the full screen width with no side padding." },
  rounded: { label: "Rounded corners", description: "Apply rounded corners around the image in any mode." },
  autoplay: { label: "Play automatically" },
  categoryId: { label: "Category" },
  featuredOnly: { label: "Featured products only" },
  search: { label: "Search words", description: "Optional. Works like the store search box, e.g. “phone under 20000”." },
  limit: { label: "Number of products", description: "1 to 24." },
  grid: { label: "Grid style", description: "Big image tiles instead of product cards. The three settings below apply only to the grid style." },
  columns: { label: "Grid: columns", description: "2 or 3." },
  showName: { label: "Grid: show the product name" },
  showPrice: { label: "Grid: show the price" },
};
/** Fields shown with their own editor. */
const FIELD_TYPE: Record<string, string> = {
  images: "billboardImages",
  categoryId: "category",
  markdown: "markdown",
  height: "heightPair",
  mobileHeight: "hidden",
};

/** Reports every form change to the parent. Lives inside AutoForm to reach its form context. */
const ChangeListener = ({ onChange }: { onChange: SectionFormProps["onChange"] }) => {
  const { watch } = useFormContext();
  useEffect(() => {
    const subscription = watch((values) => onChange(values));
    return () => subscription.unsubscribe();
  }, [watch, onChange]);
  return null;
};

export const SectionForm = ({ page, type, settings, categories, saving, onChange, onSave, onCancel }: SectionFormProps) => {
  const schema = useMemo(() => new ZodProvider(formSchema(type)), [type]);
  const formComponents = useMemo(() => {
    // On the category and product pages a products query can use "this page's category".
    const withCurrent = page === "category" || page === "product" ? [{ value: CURRENT_CATEGORY, label: "This page's category" }, ...categories] : categories;
    return {
      billboardImages: ImagesField,
      markdown: MarkdownField,
      category: optionsField(withCurrent, true),
      heightPair: HeightPairField,
      hidden: HiddenField,
      code: CodeField,
      dataQueries: dataQueriesField(withCurrent, page),
    };
  }, [categories, page]);

  return (
    <AutoForm schema={schema} defaultValues={settings} formComponents={formComponents} onSubmit={onSave}>
      <ChangeListener onChange={onChange} />
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>Save</Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button>
      </div>
    </AutoForm>
  );
};

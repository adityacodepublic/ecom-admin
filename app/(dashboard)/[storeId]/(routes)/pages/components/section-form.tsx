"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useController, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { ZodProvider, fieldConfig } from "@autoform/zod";
import type { AutoFormFieldProps } from "@autoform/react";

import { AutoForm } from "@/components/ui/autoform";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const splitRatio = (raw: unknown, fallbackW: string, fallbackH: string): [string, string] => {
  if (typeof raw !== "string") return [fallbackW, fallbackH];
  const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(raw.trim());
  return m ? [m[1], m[2]] : [fallbackW, fallbackH];
};

/** One [ W ] : [ H ] ratio input pair with "Width" / "Height" captions below each box (always filled). */
const RatioBoxes = ({
  idPrefix,
  title,
  value,
  onChange,
  defaultW,
  defaultH,
  error,
}: {
  idPrefix: string;
  title: string;
  value: unknown;
  onChange: (next: string) => void;
  defaultW: string;
  defaultH: string;
  error?: string;
}) => {
  const [initW, initH] = splitRatio(value, defaultW, defaultH);
  const [w, setW] = useState(initW);
  const [h, setH] = useState(initH);

  const update = (nextW: string, nextH: string) => {
    setW(nextW);
    setH(nextH);
    onChange(`${nextW.trim()}:${nextH.trim()}`);
  };

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <div className="flex items-start gap-1.5">
        <div className="grid flex-1 gap-1">
          <Input
            id={`${idPrefix}-w`}
            type="number"
            step="any"
            min={0.1}
            className={`h-9 text-center ${error ? "border-destructive" : ""}`}
            value={w}
            onChange={(e) => update(e.target.value, h)}
            aria-label={`${title} width`}
          />
          <span className="text-center text-[11px] text-muted-foreground">Width</span>
        </div>
        <span className="pt-2 text-sm font-semibold text-muted-foreground">:</span>
        <div className="grid flex-1 gap-1">
          <Input
            id={`${idPrefix}-h`}
            type="number"
            step="any"
            min={0.1}
            className={`h-9 text-center ${error ? "border-destructive" : ""}`}
            value={h}
            onChange={(e) => update(w, e.target.value)}
            aria-label={`${title} height`}
          />
          <span className="text-center text-[11px] text-muted-foreground">Height</span>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

/** Side-by-side Desktop + Mobile [ W ] : [ H ] boxes + "Fill image" toggle; shown only when "Use aspect ratio" is checked. */
const RatioPairField = () => {
  const useRatio = useWatch({ name: "useAspectRatio" });
  const { field: desktop, fieldState: desktopState } = useController({ name: "aspectRatio" });
  const { field: mobile, fieldState: mobileState } = useController({ name: "mobileAspectRatio" });
  const { field: fill } = useController({ name: "fill" });

  if (useRatio === false) return null;

  return (
    <div className="space-y-3 border-l-2 border-muted pl-4">
      <div className="grid max-w-md grid-cols-2 gap-6">
        <RatioBoxes
          idPrefix="aspectRatio"
          title="Desktop"
          value={desktop.value}
          onChange={desktop.onChange}
          defaultW="2.4"
          defaultH="1"
          error={desktopState.error?.message}
        />
        <RatioBoxes
          idPrefix="mobileAspectRatio"
          title="Mobile"
          value={mobile.value}
          onChange={mobile.onChange}
          defaultW="2"
          defaultH="1"
          error={mobileState.error?.message}
        />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="fill" checked={!!fill.value} onCheckedChange={(checked) => fill.onChange(checked === true)} />
        <Label htmlFor="fill" className="cursor-pointer">
          Fill image
        </Label>
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
  useAspectRatio: { label: "Use aspect ratio" },
  aspectRatio: { label: "Desktop aspect ratio" },
  mobileAspectRatio: { label: "Mobile aspect ratio" },
  fill: { label: "Fill image" },
  fullWidth: { label: "Full width" },
  rounded: { label: "Rounded corners" },
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
  aspectRatio: "ratioPair",
  mobileAspectRatio: "hidden",
  fill: "hidden",
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
      ratioPair: RatioPairField,
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

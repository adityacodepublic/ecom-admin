"use client";

import { useEffect, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";
import { z } from "zod";
import { ZodProvider, fieldConfig } from "@autoform/zod";
import type { AutoFormFieldProps } from "@autoform/react";

import { AutoForm } from "@/components/ui/autoform";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENT_CATEGORY, sectionSettingsSchemas, type PageName, type SectionType } from "@/lib/home-layout";
import { CodeField, dataQueriesField, type Option } from "./data-queries-field";

export type { Option };


interface SectionFormProps {
  /** The page the section is on (a custom component's data options depend on it). */
  page: PageName;
  type: SectionType;
  settings: Record<string, unknown>;
  billboards: Option[];
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
  const picker = (key: string, fieldType: string) => {
    const field = schema.shape[key] as z.ZodTypeAny | undefined;
    return field ? { [key]: field.superRefine(fieldConfig({ fieldType, label: field.description })) } : {};
  };
  return schema.extend({ ...picker("billboardId", "billboard"), ...picker("categoryId", "category") });
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

export const SectionForm = ({ page, type, settings, billboards, categories, saving, onChange, onSave, onCancel }: SectionFormProps) => {
  const schema = useMemo(() => new ZodProvider(formSchema(type)), [type]);
  const formComponents = useMemo(
    () => ({
      billboard: optionsField(billboards, false),
      category: optionsField(categories, true),
      code: CodeField,
      // On the category and product pages a products query can use "this page's category".
      dataQueries: dataQueriesField(page === "home" ? categories : [{ value: CURRENT_CATEGORY, label: "This page's category" }, ...categories], page),
    }),
    [billboards, categories, page],
  );

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

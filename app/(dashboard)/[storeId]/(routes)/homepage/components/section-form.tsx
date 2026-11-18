"use client";

import { useEffect, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";
import { z } from "zod";
import { ZodProvider, fieldConfig } from "@autoform/zod";
import type { AutoFormFieldProps } from "@autoform/react";

import { AutoForm } from "@/components/ui/autoform";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sectionSettingsSchemas, type SectionType } from "@/lib/home-layout";
import { CustomForm } from "./custom-form";

export interface Option {
  value: string;
  label: string;
}

interface SectionFormProps {
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

/** The custom component has its own form (code boxes); every other type is generated from its zod schema. */
export const SectionForm = (props: SectionFormProps) =>
  props.type === "custom" ? (
    <CustomForm settings={props.settings} saving={props.saving} onChange={props.onChange} onSave={props.onSave} onCancel={props.onCancel} />
  ) : (
    <GenericForm {...props} />
  );

const GenericForm = ({ type, settings, billboards, categories, saving, onChange, onSave, onCancel }: SectionFormProps) => {
  const schema = useMemo(() => new ZodProvider(formSchema(type)), [type]);
  const formComponents = useMemo(
    () => ({ billboard: optionsField(billboards, false), category: optionsField(categories, true) }),
    [billboards, categories],
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

"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertModal } from "@/components/modals/alert-modal";
import {
  sectionSettingsSchemas,
  sectionTypeLabels,
  type HomeLayout,
  type HomeSection,
  type SectionType,
} from "@/lib/home-layout";
import { SectionForm, type Option } from "./section-form";
import { SectionPreview } from "./section-preview";

interface HomeLayoutEditorProps {
  initialLayout: HomeLayout;
  storeUrl: string;
  billboards: Option[];
  categories: Option[];
}

/** The section being edited. `isNew`: added but not saved yet, so Cancel removes it. */
interface Editing {
  index: number;
  settings: Record<string, unknown>;
  isNew: boolean;
}

/**
 * The store home page as a list of cards. Each card shows the live section (store iframe)
 * with up / down / edit / delete. Every change saves the whole layout at once.
 */
export const HomeLayoutEditor = ({ initialLayout, storeUrl, billboards, categories }: HomeLayoutEditorProps) => {
  const { storeId } = useParams();
  const [layout, setLayout] = useState<HomeLayout>(initialLayout);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [newType, setNewType] = useState<SectionType>("carousel");
  const [saving, setSaving] = useState(false);

  const save = async (next: HomeLayout) => {
    setSaving(true);
    try {
      const { data } = await axios.put<HomeLayout>(`/api/${storeId}/home-layout`, next);
      setLayout(data);
      return true;
    } catch {
      toast.error("Could not save the home page.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, by: -1 | 1) => {
    const next = [...layout];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    save(next);
  };

  const add = () => {
    // Zod fills the defaults; the first billboard and a title make the new section valid at once.
    const settings = sectionSettingsSchemas[newType].parse({ title: "New section", billboardId: billboards[0]?.value });
    setLayout([...layout, { id: crypto.randomUUID(), type: newType, settings } as HomeSection]);
    setEditing({ index: layout.length, settings, isNew: true });
  };

  const cancelEdit = () => {
    if (editing?.isNew) setLayout(layout.filter((_, i) => i !== editing.index));
    setEditing(null);
  };

  const saveEdit = async (settings: Record<string, unknown>) => {
    if (!editing) return;
    const next = layout.map((s, i) => (i === editing.index ? ({ ...s, settings } as HomeSection) : s));
    if (await save(next)) {
      setEditing(null);
      toast.success("Saved.");
    }
  };

  const confirmDelete = async () => {
    if (deleteIndex === null) return;
    if (await save(layout.filter((_, i) => i !== deleteIndex))) setDeleteIndex(null);
  };

  const onDraftChange = useCallback(
    (settings: Record<string, unknown>) => setEditing((e) => (e ? { ...e, settings } : e)),
    [],
  );

  return (
    <>
      <AlertModal isOpen={deleteIndex !== null} onClose={() => setDeleteIndex(null)} onConfirm={confirmDelete} loading={saving} />
      <div className="flex items-center justify-between">
        <Heading title="Home page" description="Sections of the store home page, top to bottom" />
      </div>
      <Separator />

      {layout.length === 0 && (
        <p className="text-sm text-muted-foreground">No sections yet. The store shows only the category icons.</p>
      )}

      {layout.map((section, index) => {
        const isEditing = editing?.index === index;
        // While editing, the preview follows the form, before it is saved.
        const shown = isEditing ? ({ ...section, settings: editing.settings } as HomeSection) : section;
        return (
          <div key={section.id} className="flex gap-3 rounded-lg border bg-card p-3">
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">{sectionTypeLabels[section.type]}</p>
              <SectionPreview storeUrl={storeUrl} section={shown} />
              {isEditing && (
                <SectionForm
                  type={section.type}
                  settings={section.settings}
                  billboards={billboards}
                  categories={categories}
                  saving={saving}
                  onChange={onDraftChange}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button size="icon" variant="outline" aria-label="Move up" disabled={saving || !!editing || index === 0} onClick={() => move(index, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" aria-label="Move down" disabled={saving || !!editing || index === layout.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" aria-label="Edit" disabled={saving || !!editing} onClick={() => setEditing({ index, settings: section.settings, isNew: false })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="destructive" aria-label="Delete" disabled={saving || !!editing} onClick={() => setDeleteIndex(index)}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <Select value={newType} onValueChange={(v) => setNewType(v as SectionType)} disabled={!!editing}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sectionTypeLabels).map(([type, label]) => (
              <SelectItem key={type} value={type}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={!!editing || saving}>
          <Plus className="mr-2 h-4 w-4" /> Add section
        </Button>
      </div>
    </>
  );
};

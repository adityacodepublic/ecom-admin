"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertModal } from "@/components/modals/alert-modal";
import { Modal } from "@/components/ui/modal";
import {
  pageSectionTypes,
  sectionSettingsSchemas,
  sectionTypeLabels,
  type PageLayout,
  type PageName,
  type PageSection,
  type SectionType,
} from "@/lib/home-layout";
import { SectionForm, type Option } from "./section-form";
import { SectionPreview } from "./section-preview";

// A new custom component starts as a working example (it reads the store name from STORE_DATA).
const STARTER_HTML =
  '<div style="padding:32px 16px;text-align:center;font-size:22px">Welcome to <b id="name"></b></div><script>document.getElementById("name").textContent = STORE_DATA.store.name;</script>';

interface PageLayoutEditorProps {
  page: PageName;
  initialLayout: PageLayout;
  storeUrl: string;
  billboards: Option[];
  categories: Option[];
  /** The products to preview the product page with. */
  products: Option[];
}

/** The section being edited. `isNew`: added but not saved yet, so Cancel removes it. */
interface Editing {
  index: number;
  settings: Record<string, unknown>;
  isNew: boolean;
}

/**
 * The layout of one store page (home, category or product) as a list of cards. Each card shows the live section
 * (store iframe) with up / down / edit / delete. Every change saves the whole layout at once.
 */
export const PageLayoutEditor = ({ page, initialLayout, storeUrl, billboards, categories, products }: PageLayoutEditorProps) => {
  const { storeId } = useParams();
  const [layout, setLayout] = useState<PageLayout>(initialLayout);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [newType, setNewType] = useState<SectionType>(pageSectionTypes[page][0]);
  const [saving, setSaving] = useState(false);

  // The category and product pages are previewed with one real category / product.
  const previewOptions = page === "category" ? categories : page === "product" ? products : [];
  const [previewId, setPreviewId] = useState<string | undefined>(previewOptions[0]?.value);

  // Built-in blocks of the category and product pages can be used once; custom components any number of times.
  const available = pageSectionTypes[page].filter((t) => t === "custom" || page === "home" || !layout.some((s) => s.type === t));
  const addType = available.includes(newType) ? newType : available[0];

  const save = async (next: PageLayout) => {
    setSaving(true);
    try {
      const { data } = await axios.put<PageLayout>(`/api/${storeId}/page-layouts/${page}`, next);
      setLayout(data);
      return true;
    } catch {
      toast.error("Could not save the page.");
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
    const seed: Record<string, unknown> = { billboardId: billboards[0]?.value, html: STARTER_HTML };
    if (addType !== "relatedProducts") seed.title = "New section";
    const settings = sectionSettingsSchemas[addType].parse(seed);
    setLayout([...layout, { id: crypto.randomUUID(), type: addType, settings } as PageSection]);
    setEditing({ index: layout.length, settings, isNew: true });
  };

  const cancelEdit = () => {
    if (editing?.isNew) setLayout(layout.filter((_, i) => i !== editing.index));
    setEditing(null);
  };

  const saveEdit = async (settings: Record<string, unknown>) => {
    if (!editing) return;
    const next = layout.map((s, i) => (i === editing.index ? ({ ...s, settings } as PageSection) : s));
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
    <div className="space-y-4">
      <AlertModal isOpen={deleteIndex !== null} onClose={() => setDeleteIndex(null)} onConfirm={confirmDelete} loading={saving} />
      {editing && (
        <Modal
          title={`Edit: ${sectionTypeLabels[layout[editing.index].type]}`}
          description="The preview follows your changes. Save to make them live."
          isOpen
          onClose={cancelEdit}
          className="max-h-[90vh] max-w-5xl overflow-y-auto"
        >
          <div className="space-y-4">
            {/* While editing, the preview follows the form, before it is saved. */}
            <SectionPreview
              storeUrl={storeUrl}
              page={page}
              itemId={previewId}
              section={{ ...layout[editing.index], settings: editing.settings } as PageSection}
            />
            <SectionForm
              page={page}
              type={layout[editing.index].type}
              settings={layout[editing.index].settings}
              billboards={billboards}
              categories={categories}
              saving={saving}
              onChange={onDraftChange}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          </div>
        </Modal>
      )}

      {page !== "home" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            This layout is used by every {page === "category" ? "category" : "product"} page. Preview with:
          </span>
          {previewOptions.length === 0 ? (
            <span className="text-muted-foreground">(add a {page === "category" ? "category" : "product"} first)</span>
          ) : (
            <Select value={previewId} onValueChange={setPreviewId} disabled={!!editing}>
              <SelectTrigger className="w-72 max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {previewOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {layout.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {page === "home" ? "No sections yet. The store shows only the category icons." : "No blocks. The page shows nothing. Add a block below."}
        </p>
      )}

      {layout.map((section, index) => {
        return (
          <div key={section.id} className="flex gap-3 rounded-lg border bg-card p-3">
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">{sectionTypeLabels[section.type]}</p>
              <SectionPreview storeUrl={storeUrl} page={page} itemId={previewId} section={section} />
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
        <Select value={addType} onValueChange={(v) => setNewType(v as SectionType)} disabled={!!editing}>
          <SelectTrigger className="w-72 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map((type) => (
              <SelectItem key={type} value={type}>
                {sectionTypeLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={!!editing || saving}>
          <Plus className="mr-2 h-4 w-4" /> Add {page === "home" ? "section" : "block"}
        </Button>
      </div>
    </div>
  );
};

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertModal } from "@/components/modals/alert-modal";
import { Modal } from "@/components/ui/modal";
import {
  isFixedType,
  pageSectionTypes,
  sectionSettingsSchemas,
  sectionTypeLabels,
  type PageKind,
  type PageLayout,
  type PageSection,
  type SectionType,
} from "@/lib/home-layout";
import type { Option } from "./section-form";
import { SectionPreview } from "./section-preview";
import { fixedBlockInfo } from "./fixed-blocks";

// The block form (AutoForm, zod, the date picker) is only shown inside the edit dialog, so it loads on the first
// "edit" click instead of with the page.
const SectionForm = dynamic(() => import("./section-form").then((m) => m.SectionForm), {
  ssr: false,
  loading: () => <div className="h-40 rounded-md border bg-muted/40" />,
});

// A new custom component starts as a working example (it reads the store name from STORE_DATA).
const STARTER_HTML =
  '<div style="padding:32px 16px;text-align:center;font-size:22px">Welcome to <b id="name"></b></div><script>document.getElementById("name").textContent = STORE_DATA.store.name;</script>';

/** The settings a new block starts with (zod fills the defaults). A new Billboard starts without images. */
const newSettings = (type: SectionType): Record<string, unknown> => {
  if (type === "carousel")
    return {
      images: [],
      slides: 1,
      useAspectRatio: true,
      aspectRatio: "2.4:1",
      mobileAspectRatio: "2:1",
      naturalSize: false,
      fullWidth: false,
      rounded: true,
      autoplay: true,
    };
  if (type === "markdown") return { markdown:"## New section\n\nWrite your text here." };
  return sectionSettingsSchemas[type].parse({ title: type === "relatedProducts" ? undefined : "New block", html: STARTER_HTML });
};

/** A group heading in the add-block list: small, grey and in capitals, so it does not read as a choice. */
const GROUP_LABEL = "pl-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

interface PageLayoutEditorProps {
  page: PageKind;
  /** A custom page's route (page = "custom"). */
  route?: string;
  initialLayout: PageLayout;
  storeUrl: string;
  categories: Option[];
  /** The products to preview the product page with. */
  products: Option[];
}

type DraftSink = (settings: Record<string, unknown>) => void;

/**
 * The preview in the edit window. It keeps the form's draft itself, so typing re-renders only this frame.
 * (Re-rendering the whole window on every change moved the cursor of the Markdown editor while typing.)
 */
const DraftPreview = ({ connect, section, ...props }: { connect: (sink: DraftSink) => void; section: PageSection; storeUrl: string; page: PageKind; itemId?: string }) => {
  const [settings, setSettings] = useState(section.settings as Record<string, unknown>);
  useEffect(() => connect(setSettings), [connect]);
  return <SectionPreview {...props} section={{ ...section, settings } as PageSection} />;
};

/** The block being edited. `isNew`: added but not saved yet, so Cancel removes it. `settings`: the saved ones (the draft lives in DraftPreview). */
interface Editing {
  index: number;
  settings: Record<string, unknown>;
  isNew: boolean;
}

/**
 * The layout of one store page (home, category or product) as a list of cards. Each card shows the live block
 * (store iframe) with up / down / edit / delete. Every change saves the whole layout at once.
 * Fixed blocks show the store's own data: their edit window says where that data is edited instead of a form.
 */
export const PageLayoutEditor = ({ page, route, initialLayout, storeUrl, categories, products }: PageLayoutEditorProps) => {
  const { storeId } = useParams<{ storeId: string }>();
  const [layout, setLayout] = useState<PageLayout>(initialLayout);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [newType, setNewType] = useState<SectionType>(pageSectionTypes[page][0]);
  const [saving, setSaving] = useState(false);

  // The category and product pages are previewed with one real category / product.
  const previewOptions = page === "category" ? categories : page === "product" ? products : [];
  const [previewId, setPreviewId] = useState<string | undefined>(previewOptions[0]?.value);
  const previewItem = previewOptions.find((o) => o.value === previewId);

  // Fixed blocks can be used once per page; the others any number of times.
  const available = pageSectionTypes[page].filter((t) => !isFixedType(t) || !layout.some((s) => s.type === t));
  const addType = available.includes(newType) ? newType : available[0];
  const fixedAvailable = available.filter(isFixedType);
  const otherAvailable = available.filter((t) => !isFixedType(t));

  const save = async (next: PageLayout) => {
    setSaving(true);
    try {
      const { data } = await axios.put<PageLayout>(`/api/${storeId}/page-layouts/${route ?? page}`, next);
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

  const add = async () => {
    if (!addType) return;
    const section = { id: crypto.randomUUID(), type: addType, settings: newSettings(addType) } as PageSection;
    // A fixed block has nothing to fill in: it is saved at once (Related products keeps its default title).
    if (isFixedType(addType)) {
      if (await save([...layout, section])) toast.success(`${sectionTypeLabels[addType]} added at the bottom.`);
      return;
    }
    setLayout([...layout, section]);
    setEditing({ index: layout.length, settings: section.settings, isNew: true });
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

  // The form's changes go straight to the preview (DraftPreview), not through this component's state.
  const draftSink = useRef<DraftSink | null>(null);
  const connectDraft = useCallback((sink: DraftSink) => {
    draftSink.current = sink;
  }, []);
  const onDraftChange = useCallback((settings: Record<string, unknown>) => draftSink.current?.(settings), []);

  const editingType = editing ? layout[editing.index].type : null;
  const fixedInfo = editingType && isFixedType(editingType) ? fixedBlockInfo(editingType, storeId, previewItem && { id: previewItem.value, label: previewItem.label }) : null;

  return (
    <div className="space-y-4">
      <AlertModal isOpen={deleteIndex !== null} onClose={() => setDeleteIndex(null)} onConfirm={confirmDelete} loading={saving} />
      {editing && editingType && (
        <Modal
          title={`Edit: ${sectionTypeLabels[editingType]}`}
          description={fixedInfo ? "A fixed block: it shows your store's own data, which is edited elsewhere." : editingType === "markdown" ? "Write formatted text. Save to make it live." : "The preview follows your changes. Save to make them live."}
          isOpen
          onClose={cancelEdit}
          className="max-h-[90vh] max-w-5xl overflow-y-auto"
        >
          <div className="space-y-4">
            {/* While editing, the preview follows the form, before it is saved. */}
            {/* A Markdown block needs no live preview: its editor already shows the formatted text. */}
            {editingType !== "markdown" && <DraftPreview connect={connectDraft} storeUrl={storeUrl} page={page} itemId={previewId} section={{ ...layout[editing.index], settings: editing.settings } as PageSection} />}
            {fixedInfo && (
              <div className="space-y-3 rounded-md border bg-muted/40 p-3">
                <p className="text-sm">{fixedInfo.text}</p>
                {fixedInfo.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {fixedInfo.links.map((link, i) => (
                      <Button key={link.href} asChild size="sm" variant={i === 0 ? "default" : "outline"}>
                        <Link href={link.href}>
                          {link.label} <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {fixedInfo && editingType !== "relatedProducts" ? (
              <Button type="button" variant="outline" onClick={cancelEdit}>
                Close
              </Button>
            ) : (
              <SectionForm
                page={page}
                type={editingType}
                settings={layout[editing.index].settings}
                categories={categories}
                saving={saving}
                onChange={onDraftChange}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            )}
          </div>
        </Modal>
      )}

      {/* Add a block: a pill that stays in the top right corner while the page scrolls. */}
      <div className="pointer-events-none sticky top-3 z-20 flex justify-end">
        <div className="pointer-events-auto flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg backdrop-blur">
          {available.length === 0 ? (
            <span className="px-3 text-sm text-muted-foreground">Every block is on the page</span>
          ) : (
            <>
              <Select value={addType} onValueChange={(v) => setNewType(v as SectionType)} disabled={!!editing}>
                <SelectTrigger aria-label="Block to add" className="h-8 w-auto min-w-0 max-w-md rounded-full border-0 shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {otherAvailable.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={GROUP_LABEL}>Content blocks</SelectLabel>
                      {otherAvailable.map((type) => (
                        <SelectItem key={type} value={type}>
                          {sectionTypeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {otherAvailable.length > 0 && fixedAvailable.length > 0 && <SelectSeparator className="my-1.5" />}
                  {fixedAvailable.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={GROUP_LABEL}>Fixed blocks · once per page</SelectLabel>
                      {fixedAvailable.map((type) => (
                        <SelectItem key={type} value={type}>
                          {sectionTypeLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 shrink-0 whitespace-nowrap rounded-full" onClick={add} disabled={!!editing || saving}>
                <Plus className="mr-1.5 h-4 w-4" /> Add block
              </Button>
            </>
          )}
        </div>
      </div>

      {(page === "category" || page === "product") && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            This layout is used by every {page === "category" ? "category" : "product"} page. Preview with:
          </span>
          {previewOptions.length === 0 ? (
            <span className="text-muted-foreground">(add a {page === "category" ? "category" : "product"} first)</span>
          ) : (
            <Select value={previewId} onValueChange={setPreviewId} disabled={!!editing}>
              <SelectTrigger className="w-auto min-w-48 max-w-full">
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

      {layout.length === 0 && <p className="text-sm text-muted-foreground">No blocks. The page shows nothing. Add a block with the button at the top right.</p>}

      {layout.map((section, index) => {
        const fixed = isFixedType(section.type);
        return (
          <div key={section.id} className="flex gap-3 rounded-lg border bg-card p-3">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {sectionTypeLabels[section.type]}
                {fixed && (
                  <Badge variant="secondary" title="Shows the store's own data, edited elsewhere in the admin (see Edit)">
                    Fixed
                  </Badge>
                )}
              </div>
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
    </div>
  );
};

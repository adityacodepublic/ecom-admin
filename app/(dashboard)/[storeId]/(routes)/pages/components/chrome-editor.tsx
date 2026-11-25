"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Monitor, Pencil, RotateCcw, Smartphone } from "lucide-react";
import { toast } from "react-hot-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { CHROME_HTML_MAX, DEFAULT_FOOTER_HTML, DEFAULT_NAVBAR_HTML, validateChromeHtml } from "@/lib/chrome-templates";

type ChromePart = "navbar" | "footer";

const isDefault = (html: string, fallback: string) => html.trim() === fallback.trim();

const PART_META: Record<ChromePart, { label: string; hint: string; fallback: string }> = {
  navbar: {
    label: "Navbar (Header)",
    hint: "Readymade tags: <store-logo />, <store-search />, <store-cart />, <store-account />. Variables: {{store.name}}, {{store.homeHref}}.",
    fallback: DEFAULT_NAVBAR_HTML,
  },
  footer: {
    label: "Footer",
    hint: "Readymade tags: <store-categories />, <store-pages />, <store-contact />. Variables: {{store.name}}, {{store.year}}, {{store.homeHref}}, {{store.cartHref}}, {{store.ordersHref}}, {{contact.phone}}, {{contact.whatsapp}}.",
    fallback: DEFAULT_FOOTER_HTML,
  },
};

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Live iframe preview of the real storefront navbar or footer via /preview/chrome. */
const ChromePreview = ({
  storeUrl,
  part,
  html,
  mobile = false,
}: {
  storeUrl: string;
  part: ChromePart;
  html: string;
  mobile?: boolean;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(part === "navbar" ? 64 : 220);
  const fallback = PART_META[part].fallback;
  const effective = isDefault(html, fallback) ? "" : html;
  const src = useDebounced(`${storeUrl}/preview/chrome?part=${part}&html=${encodeURIComponent(effective)}`, 400);

  useEffect(() => {
    const storeOrigin = new URL(storeUrl).origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === storeOrigin && e.source === frame.current?.contentWindow && e.data?.type === "section-preview-height") {
        setHeight(Math.max(52, Number(e.data.height) || 64));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [storeUrl]);

  return (
    <div className={mobile ? "mx-auto w-[390px] max-w-full" : "w-full"}>
      <iframe
        ref={frame}
        src={src}
        title={`${PART_META[part].label} preview`}
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none w-full rounded-md border bg-white"
        style={{ height }}
      />
    </div>
  );
};

interface ChromeEditorProps {
  storeId: string;
  storeUrl: string;
  navbarHtml: string;
  footerHtml: string;
}

/**
 * Global Header & Footer blocks inside Admin -> Pages.
 * Matches PageLayoutEditor: each block shows only its live preview with a Pencil edit button that opens a Modal.
 */
export const ChromeEditor = ({ storeId, storeUrl, navbarHtml, footerHtml }: ChromeEditorProps) => {
  const router = useRouter();
  const [saved, setSaved] = useState<{ navbar: string; footer: string }>({
    navbar: navbarHtml || DEFAULT_NAVBAR_HTML,
    footer: footerHtml || DEFAULT_FOOTER_HTML,
  });
  const [editing, setEditing] = useState<ChromePart | null>(null);
  const [draft, setDraft] = useState("");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const openEdit = (part: ChromePart) => {
    setDraft(saved[part]);
    setMobilePreview(false);
    setEditing(part);
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const editingMeta = editing ? PART_META[editing] : null;
  const draftError = editing ? validateChromeHtml(draft) : null;
  const draftCustom = editing && editingMeta ? !isDefault(draft, editingMeta.fallback) : false;

  const saveEdit = async () => {
    if (!editing || draftError) return;
    setSaving(true);
    const next = { ...saved, [editing]: draft };
    try {
      await axios.patch(`/api/${storeId}/chrome`, {
        navbarHtml: isDefault(next.navbar, DEFAULT_NAVBAR_HTML) ? "" : next.navbar,
        footerHtml: isDefault(next.footer, DEFAULT_FOOTER_HTML) ? "" : next.footer,
      });
      setSaved(next);
      setEditing(null);
      toast.success("Saved.");
      router.refresh();
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && typeof err.response?.data?.error?.message === "string"
          ? err.response.data.error.message
          : "Could not save header and footer.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">
        Shown on every page of your store. Click the edit button on a block to customize its HTML and Tailwind classes.
      </p>

      {editing && editingMeta && (
        <Modal
          title={`Edit: ${editingMeta.label}`}
          description="The preview follows your changes. Save to make them live."
          isOpen
          onClose={closeEdit}
          className="max-h-[90vh] max-w-5xl overflow-y-auto"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={mobilePreview ? "outline" : "secondary"}
                  size="sm"
                  onClick={() => setMobilePreview(false)}
                >
                  <Monitor className="mr-1.5 h-3.5 w-3.5" /> Desktop
                </Button>
                <Button
                  type="button"
                  variant={mobilePreview ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setMobilePreview(true)}
                >
                  <Smartphone className="mr-1.5 h-3.5 w-3.5" /> Mobile
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || !draftCustom}
                onClick={() => setDraft(editingMeta.fallback)}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to default
              </Button>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <ChromePreview storeUrl={storeUrl} part={editing} html={draft} mobile={mobilePreview} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="chrome-html-draft">HTML (Tailwind CSS)</Label>
              <textarea
                id="chrome-html-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={saving}
                spellCheck={false}
                rows={14}
                maxLength={CHROME_HTML_MAX}
                className="w-full rounded-md border bg-background p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
              <p className="text-xs text-muted-foreground">{editingMeta.hint}</p>
              {draftError && <p className="text-sm text-destructive">{draftError}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeEdit} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={saveEdit} disabled={saving || !!draftError}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {(["navbar", "footer"] as const).map((part) => {
        const meta = PART_META[part];
        const custom = !isDefault(saved[part], meta.fallback);
        return (
          <div key={part} className="flex gap-3 rounded-lg border bg-card p-3">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {meta.label}
                <Badge variant={custom ? "default" : "secondary"}>{custom ? "Custom" : "Default"}</Badge>
              </div>
              <ChromePreview storeUrl={storeUrl} part={part} html={saved[part]} />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label={`Edit ${meta.label}`}
                disabled={saving || !!editing}
                onClick={() => openEdit(part)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

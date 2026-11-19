"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MediaPicker } from "@/components/media/media-picker";
import { nameFromUrl, thumbUrl } from "@/lib/media";

import { SettingsModal, patchSettings, useOpen } from "./setting-row";

const DEFAULT_ICON = "/storelogo.png";

const LogoPreview = ({ url }: { url: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={url ? thumbUrl(url, 96) : DEFAULT_ICON} alt="" className="h-10 w-10 shrink-0 rounded-md border bg-white object-contain p-1" />
);

const LogoModal = ({ storeId, initial, initialOnly, onClose }: { storeId: string; initial: string; initialOnly: boolean; onClose: () => void }) => {
  const router = useRouter();
  const [logo, setLogo] = useState(initial);
  const [logoOnly, setLogoOnly] = useState(initialOnly);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSave = async () => {
    setError("");
    setLoading(true);
    const err = await patchSettings(`/api/${storeId}/branding`, { logo, logoOnly: !!logo && logoOnly });
    setLoading(false);
    if (err) return setError(err);
    toast.success("Logo saved.");
    router.refresh();
    onClose();
  };

  return (
    <SettingsModal title="Store logo" isOpen onClose={onClose} onSave={onSave} loading={loading} error={error}>
      <p className="text-sm text-muted-foreground">Shown next to the store name in the store&apos;s header and as the browser tab icon. A square image works best.</p>
      <div className="flex items-center gap-4">
        <LogoPreview url={logo} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => setPickerOpen(true)}>
            <ImagePlus className="mr-2 h-4 w-4" /> Choose image
          </Button>
          {logo && (
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setLogo("")}>
              Use the default icon
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <Label htmlFor="logo-only">Show only the logo</Label>
          <p className="text-sm text-muted-foreground">
            {logo ? "For a logo that already contains the store name: the header shows the logo without the name." : "Choose a logo first."}
          </p>
        </div>
        <Switch id="logo-only" checked={!!logo && logoOnly} onCheckedChange={setLogoOnly} disabled={loading || !logo} />
      </div>
      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} multiple={false} existingUrls={[]} onSelect={(items) => items[0] && setLogo(items[0].url)} />
    </SettingsModal>
  );
};

/** The store's logo (header and browser tab). One row, edited in a modal. */
export const LogoSection = ({ storeId, logo, logoOnly }: { storeId: string; logo: string; logoOnly: boolean }) => {
  const { open, show, hide } = useOpen();
  return (
    <>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <LogoPreview url={logo} />
          <div className="min-w-0">
            <p className="text-sm font-medium">Store logo</p>
            <p className="truncate text-sm text-muted-foreground">{logo ? `${nameFromUrl(logo) || logo}${logoOnly ? " · logo only, no name in the header" : ""}` : "Default icon"}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={show} aria-label="Edit store logo">
          Edit
        </Button>
      </div>
      {open && <LogoModal storeId={storeId} initial={logo} initialOnly={logoOnly} onClose={hide} />}
    </>
  );
};

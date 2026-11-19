"use client";

import { useState } from "react";
import { ImagePlus, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import BillboardImageUpload from "@/components/ui/billboard-image-upload";
import { thumbUrl } from "@/lib/media";
import type { BillboardImage } from "@/lib/home-layout";

type Ordered = { url: string; order: number; href?: string };

interface BillboardImagesFieldProps {
  value: BillboardImage[];
  onChange: (images: BillboardImage[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * A billboard's images as a small strip plus a button. The button opens a modal with the billboard image editor
 * (add from the library, order, where a click goes). Used by the Billboard page block and by the category form.
 */
export const BillboardImagesField = ({ value, onChange, disabled, invalid }: BillboardImagesFieldProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Ordered[]>([]);
  const images = value ?? [];

  const show = () => {
    setDraft(images.map((image, i) => ({ url: image.url, href: image.href, order: i + 1 })));
    setOpen(true);
  };
  const done = () => {
    onChange([...draft].sort((a, b) => a.order - b.order).map((image) => ({ url: image.url, href: (image.href ?? "").trim() })));
    setOpen(false);
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-md border p-2 ${invalid ? "border-destructive" : "border-input"}`}>
      {images.length === 0 ? (
        <span className="px-1 text-sm text-muted-foreground">No images yet.</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {images.slice(0, 8).map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={image.url} src={thumbUrl(image.url, 96)} alt="" className="h-12 w-12 rounded object-cover" />
          ))}
          {images.length > 8 && <span className="self-center px-1 text-sm text-muted-foreground">+{images.length - 8}</span>}
        </div>
      )}
      <Button type="button" variant="secondary" size="sm" className="ml-auto" disabled={disabled} onClick={show}>
        {images.length === 0 ? <ImagePlus className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
        {images.length === 0 ? "Add images" : `Edit images (${images.length})`}
      </Button>
      {open && (
        <Modal
          title="Billboard images"
          description="Add images from the library, put them in order, and choose where a click on each one goes."
          isOpen
          onClose={() => setOpen(false)}
          className="max-h-[90vh] max-w-5xl overflow-y-auto"
        >
          <BillboardImageUpload value={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={done}>
              Done
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

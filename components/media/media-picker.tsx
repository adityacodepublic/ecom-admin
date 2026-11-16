"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MediaItem } from "@/lib/media";
import { MediaLibrary } from "@/components/media/media-library";
import { UploadTab, UrlTab } from "@/components/media/media-add";

interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Several images (product, billboard) or just one (category, markdown image). */
  multiple?: boolean;
  /** Images the field already has. They show "Added" and cannot be picked again (multiple mode). */
  existingUrls?: string[];
  onSelect: (items: MediaItem[]) => void;
}

/** One picker for every image field: upload, paste a link, or choose from the store's library. */
export function MediaPicker({ open, onOpenChange, multiple = true, existingUrls = [], onSelect }: MediaPickerProps) {
  const params = useParams();
  const storeId = params.storeId as string;
  const [tab, setTab] = useState("library");
  const [selected, setSelected] = useState<MediaItem[]>([]);

  // Start clean every time it opens.
  useEffect(() => {
    if (open) {
      setSelected([]);
      setTab("library");
    }
  }, [open]);

  const toggle = (item: MediaItem) => {
    setSelected((cur) => {
      const has = cur.some((s) => s.url === item.url);
      if (!multiple) return has ? [] : [item];
      return has ? cur.filter((s) => s.url !== item.url) : [...cur, item];
    });
  };
  // After an upload or a pasted link: select it (single mode replaces).
  const addSelected = (item: MediaItem) =>
    setSelected((cur) => {
      if (cur.some((s) => s.url === item.url)) return cur;
      return multiple ? [...cur, item] : [item];
    });
  const forget = (url: string) => setSelected((cur) => cur.filter((s) => s.url !== url));

  const confirm = () => {
    onSelect(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:rounded-lg"
      >
        <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
          <DialogTitle>{multiple ? "Add images" : "Choose an image"}</DialogTitle>
          <DialogDescription className="sr-only">
            Upload an image, add one from a link, or choose from your store&apos;s images.
          </DialogDescription>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 sm:px-6">
            <TabsList>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="url">From URL</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="library" className="relative mt-3 min-h-0 flex-1">
            <MediaLibrary
              storeId={storeId}
              multiple={multiple}
              selected={selected}
              existingUrls={multiple ? existingUrls : []}
              onToggle={toggle}
              onDeleted={forget}
              onGoUpload={() => setTab("upload")}
            />
          </TabsContent>
          <TabsContent value="upload" className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
            <UploadTab storeId={storeId} multiple={multiple} onUploaded={addSelected} />
          </TabsContent>
          <TabsContent value="url" className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
            <UrlTab storeId={storeId} onAdded={addSelected} />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-2 border-t bg-background px-4 py-3 sm:px-6">
          <span className="text-sm text-muted-foreground">
            {selected.length === 0 ? "Nothing selected" : `${selected.length} selected`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={selected.length === 0} onClick={confirm}>
              {multiple
                ? selected.length > 1
                  ? `Add ${selected.length} images`
                  : "Add image"
                : "Use this image"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

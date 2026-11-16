"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import { MediaPicker } from "@/components/media/media-picker";
import type { MediaItem } from "@/lib/media";
import {
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ImagePlus,
  Trash,
} from "lucide-react";

interface OrderedImage {
  url: string;
  order: number;
}

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: OrderedImage[]) => void;
  value: OrderedImage[];
  multiple?: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  disabled,
  onChange,
  value,
  multiple = true,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const currentImages = sortByOrder(value || []);
    const newImages = renumberImages([...currentImages]);
    onChange(newImages);
  }, []);

  const sortByOrder = (images: OrderedImage[]) =>
    [...images].sort((a, b) => a.order - b.order);

  const renumberImages = (images: OrderedImage[]) =>
    images.map((img, index) => ({ ...img, order: index + 1 }));

  // Called by the picker. A single-image field (category) replaces what it has.
  const onPick = (items: MediaItem[]) => {
    const currentImages = multiple ? sortByOrder(value || []) : [];
    const have = new Set(currentImages.map((i) => i.url));
    const added = items.filter((i) => !have.has(i.url)).map((i) => ({ url: i.url, order: 0 }));
    onChange(renumberImages([...currentImages, ...added]));
  };

  const onRemove = (url: string) => {
    const filtered = sortByOrder(value).filter((img) => img.url !== url);
    onChange(renumberImages(filtered));
  };

  const moveImageUp = (index: number) => {
    if (index === 0) return;
    const sorted = sortByOrder(value);
    [sorted[index - 1], sorted[index]] = [sorted[index], sorted[index - 1]];
    onChange(renumberImages(sorted));
  };

  const moveImageDown = (index: number) => {
    const sorted = sortByOrder(value);
    if (index === sorted.length - 1) return;
    [sorted[index], sorted[index + 1]] = [sorted[index + 1], sorted[index]];
    onChange(renumberImages(sorted));
  };

  if (!isMounted) {
    return null;
  }

  const sortedImages = renumberImages(sortByOrder(value || []));

  return (
    <div className="space-y-4">
      <div className="mb-2 flex flex-wrap gap-4">
        {sortedImages.map((image, index) => (
          <div
            key={image.url}
            className="relative w-[200px] h-[240px] rounded-md overflow-hidden "
          >
            <div className="relative w-full h-[200px]">
              <div className="z-10 absolute top-2 right-2">
                <Button
                  type="button"
                  onClick={() => onRemove(image.url)}
                  variant="destructive"
                  size="sm"
                  disabled={disabled}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
              <Image
                fill
                className="object-cover"
                alt="Image"
                src={image.url}
              />
            </div>
            {sortedImages.length > 1 && (
              <div className="h-[40px] flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="p-2 rounded-lg"
                  disabled={disabled || index === 0}
                  onClick={() => moveImageUp(index)}
                >
                  <ChevronLeft className="hidden md:block h-5 w-5" />
                  <ChevronUp className="block md:hidden h-5 w-5" />
                </Button>
                <span className="text-sm font-medium min-w-[20px] text-center">
                  {image.order}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="p-2 rounded-lg"
                  disabled={disabled || index === sortedImages.length - 1}
                  onClick={() => moveImageDown(index)}
                >
                  <ChevronRight className="hidden md:block h-5 w-5" />
                  <ChevronDown className="block md:hidden h-5 w-5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Button type="button" disabled={disabled} variant="secondary" onClick={() => setPickerOpen(true)}>
        <ImagePlus className="h-4 w-4 mr-2" />
        {multiple ? "Add images" : sortedImages.length ? "Change image" : "Add image"}
      </Button>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple={multiple}
        existingUrls={sortedImages.map((i) => i.url)}
        onSelect={onPick}
      />
    </div>
  );
};

export default ImageUpload;

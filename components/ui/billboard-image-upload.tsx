"use client";

import { CldUploadWidget } from "next-cloudinary";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { ChevronRight, ChevronLeft, ChevronUp, ChevronDown, ImagePlus, Trash } from "lucide-react";

interface BillboardOrderedImage {
  url: string;
  order: number;
  href?: string;
}

interface BillboardImageUploadProps {
  disabled?: boolean;
  onChange: (value: BillboardOrderedImage[]) => void;
  value: BillboardOrderedImage[];
}

const BillboardImageUpload: React.FC<BillboardImageUploadProps> = ({
  disabled,
  onChange,
  value,
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const currentImages = sortByOrder(value || []);
    const newImages = renumberImages([...currentImages]);
    onChange(newImages);
  }, []);

  const sortByOrder = (images: BillboardOrderedImage[]) =>
    [...images].sort((a, b) => a.order - b.order);

  const renumberImages = (images: BillboardOrderedImage[]) =>
    images.map((img, index) => ({ ...img, order: index + 1 }));

  const onUpload = (result: any) => {
    const currentImages = sortByOrder(value || []);
    const newImages = renumberImages([
      ...currentImages,
      {
        url: result.info.secure_url,
        order: currentImages.length + 1,
        href: "",
      },
    ]);
    onChange(newImages);
  };

  const onRemove = (url: string) => {
    const filtered = sortByOrder(value).filter((img) => img.url !== url);
    onChange(renumberImages(filtered));
  };

  const onHrefChange = (url: string, newHref: string) => {
    const updated = sortByOrder(value).map((img) =>
      img.url === url ? { ...img, href: newHref } : img
    );
    onChange(updated);
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
    <div className="space-y-10 py-2">
      <CldUploadWidget onUpload={onUpload} uploadPreset="ecommtest">
        {({ open }) => {
          const onClick = () => {
            open();
          };

          return (
            <Button
              type="button"
              disabled={disabled}
              variant="secondary"
              onClick={onClick}
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              Upload an Image
            </Button>
          );
        }}
      </CldUploadWidget>
      <div className="mb-2 mt-5 flex flex-wrap gap-4">
        {sortedImages.map((image, index) => (
          <div
            key={image.url}
            className="relative w-[400px] rounded-lg overflow-hidden border"
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
              <div className="h-[40px] flex items-center justify-center gap-2 mt-2">
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
            <div className="p-3">
              <div className="text-foreground/80 mb-0.5 text-sm">
                Destination page (optional)
              </div>
              <Input
                type="text"
                placeholder="e.g. https://example.com/product"
                value={image.href || ""}
                onChange={(e) => onHrefChange(image.url, e.target.value)}
                disabled={disabled}
                className="text-sm"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BillboardImageUpload;

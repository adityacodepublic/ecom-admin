"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertTriangle } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SlugInput } from "@/components/slug-input";
import { slugErrorFromResponse, useSlugAvailability } from "@/hooks/use-slug-availability";
import { slugError } from "@/lib/slug";
import { storeUrl } from "@/lib/store-url";

interface ChangeSlugModalProps {
  storeId: string;
  currentSlug: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Renames the store URL. The old URL stops working right away (no redirect), so the modal says so. */
export const ChangeSlugModal = ({ storeId, currentSlug, isOpen, onClose }: ChangeSlugModalProps) => {
  const router = useRouter();
  const [slug, setSlug] = useState(currentSlug);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hint = useSlugAvailability(slug, storeId);

  // Start from the current slug each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setSlug(currentSlug);
      setServerError(null);
    }
  }, [isOpen, currentSlug]);

  const unchanged = slug === currentSlug;
  const invalid = slugError(slug);

  const onSave = async () => {
    try {
      setLoading(true);
      await axios.patch(`/api/stores/${storeId}/slug`, { slug });
      toast.success("Store URL changed.");
      onClose();
      router.refresh(); // Settings and the Homepage preview read the new URL from the server.
    } catch (error) {
      const message = slugErrorFromResponse(error);
      if (message) setServerError(message);
      else toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Change store URL" description={`Current: ${storeUrl(currentSlug)}`} isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="store-slug">Store URL name</Label>
          <SlugInput
            id="store-slug"
            disabled={loading}
            value={slug}
            onChange={(value) => {
              setServerError(null);
              setSlug(value);
            }}
            hint={serverError ? { state: "error", error: serverError } : unchanged ? { state: "idle" } : hint}
          />
        </div>
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            The old URL stops working right away. Old links, bookmarks, shared links and links in emails
            to <span className="font-medium break-all">{storeUrl(currentSlug)}</span> will show &quot;Store not found&quot;.
            Another store can take the old name.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={loading || unchanged || !!invalid || !!serverError} onClick={onSave}>
            Change URL
          </Button>
        </div>
      </div>
    </Modal>
  );
};

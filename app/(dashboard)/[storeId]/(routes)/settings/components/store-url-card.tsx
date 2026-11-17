"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";

import { EditButton, SettingRow } from "./setting-row";

interface StoreUrlCardProps {
  url: string;
  onChange: () => void;
}

/** The store's public URL as one settings row: copy, open and change. */
export const StoreUrlCard = ({ url, onChange }: StoreUrlCardProps) => {
  const onCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success("Store URL copied.");
  };

  return (
    <SettingRow
      title="Store URL"
      summary={url}
      action={
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCopy} title="Copy URL" aria-label="Copy URL">
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" asChild title="Open store">
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open store">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <EditButton onClick={onChange} label="Change store URL" />
        </div>
      }
    />
  );
};

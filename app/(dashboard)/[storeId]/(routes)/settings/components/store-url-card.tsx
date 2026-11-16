"use client";

import { Copy, ExternalLink, Globe, Pencil } from "lucide-react";
import { toast } from "react-hot-toast";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface StoreUrlCardProps {
  url: string;
  onChange: () => void;
}

/** The store's public URL, with copy, open and change actions side by side. */
export const StoreUrlCard = ({ url, onChange }: StoreUrlCardProps) => {
  const onCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success("Store URL copied to clipboard.");
  };

  return (
    <Alert>
      <Globe className="h-4 w-4" />
      <AlertTitle>Store URL</AlertTitle>
      <AlertDescription className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <code className="relative break-all rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
          {url}
        </code>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCopy} title="Copy URL">
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" asChild title="Open store">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onChange}>
            <Pencil className="mr-2 h-4 w-4" />
            Change URL
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

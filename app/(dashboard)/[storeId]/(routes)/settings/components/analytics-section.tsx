"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeUrl } from "@/lib/store-url";

import { EditButton, SettingRow, SettingsModal, patchSettings, useOpen } from "./setting-row";

const ID_PATTERN = /^[a-z0-9]{6,20}$/;

const AnalyticsModal = ({ storeId, slug, initial, onClose }: { storeId: string; slug: string; initial: string; onClose: () => void }) => {
  const url = storeUrl(slug);
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const id = value.trim().toLowerCase();
  const idError = id && !ID_PATTERN.test(id) ? "A Clarity project id has only letters and numbers, for example zg7vtqkayo." : "";

  const onSave = async () => {
    if (idError) return;
    setError("");
    setLoading(true);
    const err = await patchSettings(`/api/${storeId}/analytics`, { clarityProjectId: id });
    setLoading(false);
    if (err) return setError(err);
    toast.success(id ? "Clarity connected." : "Clarity turned off.");
    router.refresh();
    onClose();
  };

  return (
    <SettingsModal title="Visitor analytics (Microsoft Clarity)" isOpen onClose={onClose} onSave={onSave} loading={loading} error={error} saveDisabled={!!idError}>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          Create a free project at{" "}
          <a href="https://clarity.microsoft.com" target="_blank" rel="noreferrer" className="underline">
            clarity.microsoft.com
          </a>{" "}
          and use your store link as the website.
          <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 py-1 pl-3 pr-1">
            <span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">{url}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Copy store link"
              aria-label="Copy store link"
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("Store link copied.");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title="Open Clarity">
              <a href="https://clarity.microsoft.com" target="_blank" rel="noreferrer" aria-label="Open Clarity">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </li>
        <li>
          In Clarity, click <span className="font-medium text-foreground">Settings</span> in the top bar &gt;{" "}
          <span className="font-medium text-foreground">Overview</span>, then copy the Project ID shown there.
        </li>
        <li>Paste it below. Heatmaps, recordings, funnels and visitor locations then appear in your Clarity project.</li>
      </ol>
      <div className="grid gap-1.5">
        <Label htmlFor="clarity-id">Clarity project ID</Label>
        <Input id="clarity-id" maxLength={20} value={value} onChange={(e) => setValue(e.target.value)} placeholder="zg7vtqkayo" disabled={loading} />
        {idError ? (
          <p className="text-sm text-destructive">{idError}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Leave it empty to turn analytics off.</p>    
        )}
      </div>
    </SettingsModal>
  );
};

/** The owner's Microsoft Clarity project id (heatmaps, recordings, funnels live in the owner's own Clarity). One row, edited in a modal. */
export const AnalyticsSection = ({ storeId, slug, clarityProjectId }: { storeId: string; slug: string; clarityProjectId: string }) => {
  const { open, show, hide } = useOpen();
  return (
    <>
      <SettingRow
        title="Visitor analytics"
        summary={clarityProjectId ? `Microsoft Clarity connected · ${clarityProjectId}` : "Not connected"}
        action={<EditButton onClick={show} label="Edit visitor analytics" />}
      />
      {open && <AnalyticsModal storeId={storeId} slug={slug} initial={clarityProjectId} onClose={hide} />}
    </>
  );
};

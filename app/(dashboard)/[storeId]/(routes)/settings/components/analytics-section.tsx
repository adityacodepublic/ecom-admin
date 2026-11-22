"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Copy, ExternalLink, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLARITY_API_TOKEN, CLARITY_API_TOKEN_ERROR, CLARITY_PROJECT_ID, CLARITY_PROJECT_ID_ERROR } from "@/lib/clarity-format";
import { storeUrl } from "@/lib/store-url";

import { EditButton, SettingRow, SettingsModal, patchSettings, useOpen } from "./setting-row";



const Bold = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-foreground/80">{children}</span>;

const CLARITY = "https://clarity.microsoft.com";

// Shown in the token field when a token is saved. Only for the look: the real token never comes to the browser,
// and this text is never sent (the field state stays empty).
const SAVED_MASK = "\u2022".repeat(24);

/** One part of the form: a numbered heading, a short explanation, then the field. */
const Step = ({ n, title, optional, children }: { n: number; title: string; optional?: boolean; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-lg bg-muted/30 p-4">
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 text-[11px] font-medium text-muted-foreground">{n}</span>
      <h4 className="text-sm font-medium">{title}</h4>
      {optional && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Optional</span>}
    </div>
    {children}
  </section>
);

const AnalyticsModal = ({
  storeId,
  slug,
  initial,
  hasApiToken,
  onClose,
}: {
  storeId: string;
  slug: string;
  initial: string;
  hasApiToken: boolean;
  onClose: () => void;
}) => {
  const url = storeUrl(slug);
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [token, setToken] = useState(""); // write-only: a saved token is never sent back to the browser
  const [removeToken, setRemoveToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const id = value.trim().toLowerCase();
  const idError = id && !CLARITY_PROJECT_ID.test(id) ? `${CLARITY_PROJECT_ID_ERROR}.` : "";
  const newToken = token.trim();
  const showSaved = hasApiToken && !removeToken && !newToken; // the dots
  const removing = hasApiToken && removeToken && !newToken;
  const tokenError = newToken && !CLARITY_API_TOKEN.test(newToken) ? `${CLARITY_API_TOKEN_ERROR}.` : "";

  const onSave = async () => {
    if (idError || tokenError) return;
    setError("");
    setLoading(true);
    const body: { clarityProjectId: string; clarityApiToken?: string } = { clarityProjectId: id };
    if (newToken) body.clarityApiToken = newToken;
    else if (removeToken) body.clarityApiToken = "";
    const err = await patchSettings(`/api/${storeId}/analytics`, body);
    setLoading(false);
    if (err) return setError(err);
    toast.success(id ? "Clarity connected." : "Clarity turned off.");
    router.refresh();
    onClose();
  };

  return (
    <SettingsModal title="Visitor analytics (Microsoft Clarity)" isOpen onClose={onClose} onSave={onSave} loading={loading} error={error} saveDisabled={!!idError || !!tokenError}>
      <p className="text-sm text-muted-foreground">
        Clarity is free. It records how visitors use your store: heatmaps, session recordings, funnels and where visitors come from.
      </p>

      <Step n={1} title="Connect your Clarity project">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Create a project at{" "}
            <a href={CLARITY} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              clarity.microsoft.com
            </a>{" "}
            and use your store link as the website.
            <div className="mt-2 flex items-center gap-1 rounded-md border bg-background/60 py-1 pl-3 pr-1">
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
                <a href={CLARITY} target="_blank" rel="noreferrer" aria-label="Open Clarity">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </li>
          <li>
            In Clarity, open <Bold>Settings</Bold> &gt; <Bold>Overview</Bold> and copy the Project ID.
          </li>
          <li>Paste it below.</li>
        </ol>
        <div className="grid gap-1.5">
          <Label htmlFor="clarity-id">Clarity project ID</Label>
          <Input id="clarity-id" maxLength={20} value={value} onChange={(e) => setValue(e.target.value)} placeholder="zg7vtqkayo" disabled={loading} />
          {idError ? <p className="text-sm text-destructive">{idError}</p> : <p className="text-xs text-muted-foreground">Leave it empty to turn analytics off.</p>}
        </div>
      </Step>

      <Step n={2} title="Show visitor numbers on your dashboard" optional>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            In{" "}
            <a href={CLARITY} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Clarity
            </a>
            , open <Bold>Settings</Bold> &gt; <Bold>Data Export</Bold> and click <Bold>Generate new API token</Bold>.
          </li>
          <li>Paste the token below. We keep it on our server and never show it again.</li>
        </ol>
        <div className="grid gap-1.5">
          <Label htmlFor="clarity-token">API token</Label>
          <div className="relative">
            <Input
              id="clarity-token"
              type="password"
              autoComplete="off"
              className={showSaved || newToken ? "pr-10" : undefined}
              value={showSaved ? SAVED_MASK : token}
              // A saved token shows as dots. Typing or pasting replaces it (the field selects all on focus).
              onFocus={(e) => showSaved && e.target.select()}
              onChange={(e) => {
                const v = e.target.value;
                setToken(showSaved ? (v.startsWith(SAVED_MASK) ? v.slice(SAVED_MASK.length) : SAVED_MASK.startsWith(v) ? "" : v) : v);
              }}
              placeholder="Paste the token"
              disabled={loading}
            />
            {(showSaved || newToken) && (
              <button
                type="button"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                title={newToken ? "Clear" : "Remove the saved token"}
                aria-label={newToken ? "Clear the token" : "Remove the saved token"}
                disabled={loading}
                onClick={() => {
                  if (newToken) setToken("");
                  else setRemoveToken(true);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {tokenError ? (
            <p className="text-sm text-destructive">{tokenError}</p>
          ) : removing ? (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              The saved token will be removed when you save.
              <button type="button" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground" onClick={() => setRemoveToken(false)}>
                <Undo2 className="h-3 w-3" /> Keep it
              </button>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{showSaved ? "A token is saved. Paste a new one to replace it." : "Needs the project to be connected in step 1."}</p>
          )}
        </div>
      </Step>
    </SettingsModal>
  );
};

/** The owner's Microsoft Clarity project id (heatmaps, recordings, funnels live in the owner's own Clarity). One row, edited in a modal. */
export const AnalyticsSection = ({ storeId, slug, clarityProjectId, hasApiToken }: { storeId: string; slug: string; clarityProjectId: string; hasApiToken: boolean }) => {
  const { open, show, hide } = useOpen();
  return (
    <>
      <SettingRow
        title="Visitor analytics"
        summary={clarityProjectId ? (hasApiToken ? "Connected, dashboard numbers on" : "Connected") : "Not connected"}
        action={<EditButton onClick={show} label="Edit visitor analytics" />}
      />
      {open && <AnalyticsModal storeId={storeId} slug={slug} initial={clarityProjectId} hasApiToken={hasApiToken} onClose={hide} />}
    </>
  );
};

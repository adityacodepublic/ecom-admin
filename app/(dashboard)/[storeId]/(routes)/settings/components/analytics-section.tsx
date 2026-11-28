"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Copy, ExternalLink, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLARITY_API_TOKEN, CLARITY_API_TOKEN_ERROR, CLARITY_PROJECT_ID, CLARITY_PROJECT_ID_ERROR } from "@/lib/clarity-format";
import { GA_MEASUREMENT_ID, GA_MEASUREMENT_ID_ERROR, normalizeGaMeasurementId } from "@/lib/ga-format";
import { GOOGLE_VERIFICATION_MAX_INPUT, extractGoogleVerificationToken } from "@/lib/google-verification-format";
import { storeUrl } from "@/lib/store-url";

import { EditButton, SettingRow, SettingsModal, patchSettings, useOpen } from "./setting-row";



const Bold = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-foreground/80">{children}</span>;

const CLARITY = "https://clarity.microsoft.com";
const GOOGLE_ANALYTICS = "https://analytics.google.com";
const SEARCH_CONSOLE = "https://search.google.com/search-console";
const MERCHANT_CENTER = "https://merchants.google.com";

/** A link shown in a box, with a copy button and an open-in-new-tab button. */
const CopyRow = ({ value, label, openHref, openLabel }: { value: string; label: string; openHref: string; openLabel: string }) => (
  <div className="mt-2 flex items-center gap-1 rounded-md border bg-background/60 py-1 pl-3 pr-1">
    <span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">{value}</span>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} copied.`);
      }}
    >
      <Copy className="h-4 w-4" />
    </Button>
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild title={openLabel}>
      <a href={openHref} target="_blank" rel="noopener noreferrer" aria-label={openLabel}>
        <ExternalLink className="h-4 w-4" />
      </a>
    </Button>
  </div>
);

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
  baseUrl,
  initial,
  hasApiToken,
  initialGoogleVerification,
  initialGoogleAnalytics,
  onClose,
}: {
  storeId: string;
  baseUrl: string;
  initial: string;
  hasApiToken: boolean;
  initialGoogleVerification: string;
  initialGoogleAnalytics: string;
  onClose: () => void;
}) => {
  const propertyUrl = `${baseUrl}/`; // a Search Console URL-prefix property ends with "/"
  const feedUrl = `${baseUrl}/feed.xml`;
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [token, setToken] = useState(""); // write-only: a saved token is never sent back to the browser
  const [removeToken, setRemoveToken] = useState(false);
  const [gsvInput, setGsvInput] = useState(initialGoogleVerification);
  const [gaInput, setGaInput] = useState(initialGoogleAnalytics);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const id = value.trim().toLowerCase();
  const idError = id && !CLARITY_PROJECT_ID.test(id) ? `${CLARITY_PROJECT_ID_ERROR}.` : "";
  const newToken = token.trim();
  const showSaved = hasApiToken && !removeToken && !newToken; // the dots
  const removing = hasApiToken && removeToken && !newToken;
  const tokenError = newToken && !CLARITY_API_TOKEN.test(newToken) ? `${CLARITY_API_TOKEN_ERROR}.` : "";
  const gsv = extractGoogleVerificationToken(gsvInput);
  const gaId = normalizeGaMeasurementId(gaInput);
  const gaError = gaId && !GA_MEASUREMENT_ID.test(gaId) ? `${GA_MEASUREMENT_ID_ERROR}.` : "";

  const onSave = async () => {
    if (idError || tokenError || !gsv.ok || gaError) return;
    setError("");
    setLoading(true);
    const body: { clarityProjectId: string; clarityApiToken?: string; googleSiteVerification: string; googleAnalyticsId: string } = {
      clarityProjectId: id,
      googleSiteVerification: gsv.token,
      googleAnalyticsId: gaId,
    };
    if (newToken) body.clarityApiToken = newToken;
    else if (removeToken) body.clarityApiToken = "";
    const err = await patchSettings(`/api/${storeId}/analytics`, body);
    setLoading(false);
    if (err) return setError(err);
    if (id !== initial) toast.success(id ? "Clarity connected." : "Clarity turned off.");
    else if (gaId !== initialGoogleAnalytics) toast.success(gaId ? "Google Analytics connected." : "Google Analytics turned off.");
    else if (gsv.token !== initialGoogleVerification) toast.success(gsv.token ? "Search Console tag saved." : "Search Console tag removed.");
    else toast.success("Visitor analytics saved.");
    router.refresh();
    onClose();
  };

  return (
    <SettingsModal
      title="Visitor analytics"
      isOpen
      onClose={onClose}
      onSave={onSave}
      loading={loading}
      error={error}
      saveDisabled={!!idError || !!tokenError || !gsv.ok || !!gaError}
    >
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
            <CopyRow value={baseUrl} label="store link" openHref={CLARITY} openLabel="Open Clarity" />
          </li>
          <li>
            In Clarity, open <Bold>Settings</Bold> &gt; <Bold>Overview</Bold> and copy the Project ID.
          </li>
          <li>Paste it below.</li>
        </ol>
        <div className="grid gap-1.5">
          <Label htmlFor="clarity-id">Clarity project ID</Label>
          <Input id="clarity-id" maxLength={20} value={value} onChange={(e) => setValue(e.target.value)} placeholder="zg7vtqkayo" disabled={loading} />
          {idError ? <p className="text-sm text-destructive">{idError}</p> : <p className="text-xs text-muted-foreground">Leave it empty to turn Clarity off.</p>}
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

      <Step n={3} title="Connect Google Analytics 4" optional>
        <p className="text-sm text-muted-foreground">
          Google Analytics is free. It counts visitors, where they come from and what they do, next to your other Google reports.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            In{" "}
            <a href={GOOGLE_ANALYTICS} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Google Analytics
            </a>
            , open <Bold>Admin</Bold> &gt; <Bold>Data streams</Bold> and add a <Bold>Web</Bold> stream with your store link.
            <CopyRow value={baseUrl} label="store link" openHref={GOOGLE_ANALYTICS} openLabel="Open Google Analytics" />
          </li>
          <li>
            Keep <Bold>Enhanced measurement</Bold> on, with <Bold>Page changes based on browser history events</Bold> checked: that is how pages
            opened inside your store are counted.
          </li>
          <li>
            Copy the <Bold>Measurement ID</Bold> (it starts with <span className="font-mono">G-</span>) and paste it below.
          </li>
        </ol>
        <div className="grid gap-1.5">
          <Label htmlFor="ga-id">Measurement ID</Label>
          <Input
            id="ga-id"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            value={gaInput}
            onChange={(e) => setGaInput(e.target.value)}
            placeholder="G-ABC123DEF4"
            disabled={loading}
            className="font-mono"
          />
          {gaError ? <p className="text-sm text-destructive">{gaError}</p> : <p className="text-xs text-muted-foreground">Leave it empty to turn Google Analytics off.</p>}
        </div>
      </Step>

      <Step n={4} title="Verify your store in Google Search Console" optional>
        <p className="text-sm text-muted-foreground">
          Search Console is free. It shows how your store appears in Google Search, which searches bring visitors, and any indexing problems.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Open{" "}
            <a href={SEARCH_CONSOLE} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Google Search Console
            </a>{" "}
            and click <Bold>Add property</Bold>.
          </li>
          <li>
            Choose <Bold>URL prefix</Bold> and enter your store link:
            <CopyRow value={propertyUrl} label="store link" openHref={SEARCH_CONSOLE} openLabel="Open Search Console" />
          </li>
          <li>
            Under <Bold>Other verification methods</Bold>, choose <Bold>HTML tag</Bold> and copy the <Bold>&lt;meta&gt;</Bold> tag.
          </li>
          <li>
            Paste it below and save, then click <Bold>Verify</Bold> in Search Console (it can take a few minutes for your store to show the new tag).
          </li>
        </ol>
        <div className="grid gap-1.5">
          <Label htmlFor="google-verification">Verification tag</Label>
          <Input
            id="google-verification"
            autoComplete="off"
            spellCheck={false}
            maxLength={GOOGLE_VERIFICATION_MAX_INPUT}
            value={gsvInput}
            onChange={(e) => setGsvInput(e.target.value)}
            placeholder='<meta name="google-site-verification" content="..." />'
            disabled={loading}
            className="font-mono text-xs"
          />
          {!gsv.ok ? (
            <p className="text-sm text-destructive">{gsv.error}.</p>
          ) : gsv.token ? (
            <p className="break-all text-xs text-muted-foreground">
              Code: <span className="font-mono text-foreground/80">{gsv.token}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Paste the whole tag or only the code in content=&quot;...&quot;. Leave empty to remove.</p>
          )}
        </div>
        <div className="mt-5 grid gap-2 border-t pt-5">
          <Label>Google Merchant Center product feed</Label>
          <p className="text-xs text-muted-foreground">
            To list your products on Google Shopping, add this link in{" "}
            <a href={MERCHANT_CENTER} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Merchant Center
            </a>{" "}
            under <Bold>Products</Bold> &gt; <Bold>Add products</Bold> &gt; <Bold>Add products from a file</Bold> (scheduled fetch). It updates on its own when you change products.
          </p>
          <CopyRow value={feedUrl} label="feed link" openHref={feedUrl} openLabel="Open the feed" />
          <p className="text-xs text-muted-foreground">
            Recommended for Google Shopping: connect your own domain (Settings &gt; Domain) and set up shipping and returns in Merchant Center.
          </p>
        </div>
      </Step>
    </SettingsModal>
  );
};

/**
 * The owner's Microsoft Clarity project id (heatmaps, recordings, funnels live in the owner's own Clarity), Google Analytics 4
 * measurement id and Google Search Console verification. One row, edited in a modal.
 */
export const AnalyticsSection = ({
  storeId,
  slug,
  clarityProjectId,
  hasApiToken,
  googleSiteVerification,
  googleAnalyticsId,
  customDomain,
  customDomainVerified,
}: {
  storeId: string;
  slug: string;
  clarityProjectId: string;
  hasApiToken: boolean;
  googleSiteVerification: string;
  googleAnalyticsId: string;
  customDomain: string;
  customDomainVerified: boolean;
}) => {
  const { open, show, hide } = useOpen();
  const summary =
    [
      clarityProjectId && (hasApiToken ? "Clarity connected, dashboard numbers on" : "Clarity connected"),
      googleAnalyticsId && "Google Analytics connected",
      googleSiteVerification && "Search Console tag added",
    ]
      .filter(Boolean)
      .join(" · ") || "Not connected";
  // The store's public address: its own domain once verified, otherwise the platform link.
  const baseUrl = customDomainVerified && customDomain ? `https://${customDomain}` : storeUrl(slug);
  return (
    <>
      <SettingRow
        title="Visitor analytics"
        summary={summary}
        action={<EditButton onClick={show} label="Edit visitor analytics" />}
      />
      {open && (
        <AnalyticsModal
          storeId={storeId}
          baseUrl={baseUrl}
          initial={clarityProjectId}
          hasApiToken={hasApiToken}
          initialGoogleVerification={googleSiteVerification}
          initialGoogleAnalytics={googleAnalyticsId}
          onClose={hide}
        />
      )}
    </>
  );
};

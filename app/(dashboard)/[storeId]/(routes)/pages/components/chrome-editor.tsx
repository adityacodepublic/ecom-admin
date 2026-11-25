"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Monitor, RotateCcw, Smartphone } from "lucide-react";
import { toast } from "react-hot-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CHROME_HTML_MAX, DEFAULT_FOOTER_HTML, DEFAULT_NAVBAR_HTML, validateChromeHtml } from "@/lib/chrome-templates";

const isDefault = (html: string, fallback: string) => html.trim() === fallback.trim();

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Live iframe preview of the real storefront navbar or footer via /preview/chrome. */
const ChromePreview = ({
  storeUrl,
  part,
  html,
  fallback,
  mobile,
}: {
  storeUrl: string;
  part: "navbar" | "footer";
  html: string;
  fallback: string;
  mobile: boolean;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(part === "navbar" ? 64 : 220);
  const effective = isDefault(html, fallback) ? "" : html;
  const src = useDebounced(`${storeUrl}/preview/chrome?part=${part}&html=${encodeURIComponent(effective)}`, 400);

  useEffect(() => {
    const storeOrigin = new URL(storeUrl).origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === storeOrigin && e.source === frame.current?.contentWindow && e.data?.type === "section-preview-height") {
        setHeight(Math.max(52, Number(e.data.height) || 64));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [storeUrl]);

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className={mobile ? "mx-auto w-[390px] max-w-full" : "w-full"}>
        <iframe
          ref={frame}
          src={src}
          title={`${part === "navbar" ? "Navbar" : "Footer"} preview`}
          loading="lazy"
          tabIndex={-1}
          className="pointer-events-none w-full rounded-md border bg-white"
          style={{ height }}
        />
      </div>
    </div>
  );
};

interface BlockCardProps {
  id: string;
  title: string;
  description: string;
  hint: string;
  part: "navbar" | "footer";
  storeUrl: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

/** One global chrome block (Navbar or Footer) with live preview and HTML editor. */
const ChromeBlockCard = ({ id, title, description, hint, part, storeUrl, value, fallback, onChange, disabled }: BlockCardProps) => {
  const [mobile, setMobile] = useState(false);
  const error = validateChromeHtml(value);
  const custom = !isDefault(value, fallback);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant={custom ? "default" : "secondary"}>{custom ? "Custom" : "Default"}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={mobile ? "outline" : "secondary"}
              size="sm"
              onClick={() => setMobile(false)}
              aria-label="Desktop preview"
            >
              <Monitor className="mr-1.5 h-3.5 w-3.5" /> Desktop
            </Button>
            <Button
              type="button"
              variant={mobile ? "secondary" : "outline"}
              size="sm"
              onClick={() => setMobile(true)}
              aria-label="Mobile preview"
            >
              <Smartphone className="mr-1.5 h-3.5 w-3.5" /> Mobile
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={disabled || !custom} onClick={() => onChange(fallback)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChromePreview storeUrl={storeUrl} part={part} html={value} fallback={fallback} mobile={mobile} />
        <div className="grid gap-1.5">
          <Label htmlFor={id}>HTML (Tailwind CSS)</Label>
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            rows={12}
            maxLength={CHROME_HTML_MAX}
            className="w-full rounded-md border bg-background p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <p className="text-xs text-muted-foreground">{hint}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

interface ChromeEditorProps {
  storeId: string;
  storeUrl: string;
  navbarHtml: string;
  footerHtml: string;
}

/** Global Header & Footer editor inside Admin -> Pages, with live storefront previews. */
export const ChromeEditor = ({ storeId, storeUrl, navbarHtml, footerHtml }: ChromeEditorProps) => {
  const router = useRouter();
  const [navbar, setNavbar] = useState(navbarHtml || DEFAULT_NAVBAR_HTML);
  const [footer, setFooter] = useState(footerHtml || DEFAULT_FOOTER_HTML);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const invalid = validateChromeHtml(navbar) !== null || validateChromeHtml(footer) !== null;

  const onSave = async () => {
    if (invalid) return;
    setError("");
    setSaving(true);
    try {
      await axios.patch(`/api/${storeId}/chrome`, {
        navbarHtml: isDefault(navbar, DEFAULT_NAVBAR_HTML) ? "" : navbar,
        footerHtml: isDefault(footer, DEFAULT_FOOTER_HTML) ? "" : footer,
      });
      toast.success("Header and footer saved.");
      router.refresh();
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && typeof err.response?.data?.error?.message === "string"
          ? err.response.data.error.message
          : "Could not save header and footer.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Shown on every page of your store. Resetting either block returns it to the built-in default.
        </p>
        <Button type="button" onClick={onSave} disabled={saving || invalid}>
          {saving ? "Saving..." : "Save header & footer"}
        </Button>
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <ChromeBlockCard
        id="navbar-html"
        title="Navbar (Header)"
        description="Top navigation bar with live store slots."
        hint="Readymade tags: <store-logo />, <store-search />, <store-cart />, <store-account />. Variables: {{store.name}}, {{store.homeHref}}."
        part="navbar"
        storeUrl={storeUrl}
        value={navbar}
        fallback={DEFAULT_NAVBAR_HTML}
        onChange={setNavbar}
        disabled={saving}
      />
      <ChromeBlockCard
        id="footer-html"
        title="Footer"
        description="Site links, categories, custom pages, and contact details."
        hint="Readymade tags: <store-categories />, <store-pages />, <store-contact />. Variables: {{store.name}}, {{store.year}}, {{store.homeHref}}, {{store.cartHref}}, {{store.ordersHref}}, {{contact.phone}}, {{contact.whatsapp}}."
        part="footer"
        storeUrl={storeUrl}
        value={footer}
        fallback={DEFAULT_FOOTER_HTML}
        onChange={setFooter}
        disabled={saving}
      />
      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={saving || invalid}>
          {saving ? "Saving..." : "Save header & footer"}
        </Button>
      </div>
    </div>
  );
};

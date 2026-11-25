"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CHROME_HTML_MAX, DEFAULT_FOOTER_HTML, DEFAULT_NAVBAR_HTML, validateChromeHtml } from "@/lib/chrome-templates";

import { patchSettings } from "./setting-row";

const isDefault = (html: string, fallback: string) => html.trim() === fallback.trim();

type EditorProps = {
  id: string;
  label: string;
  hint: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

/** One monospace HTML editor with its Default / Custom badge and a Reset to default button. */
const HtmlEditor = ({ id, label, hint, value, fallback, onChange, disabled }: EditorProps) => {
  const error = validateChromeHtml(value);
  const custom = !isDefault(value, fallback);
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>{label}</Label>
          <Badge variant={custom ? "default" : "secondary"}>{custom ? "Custom" : "Default"}</Badge>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !custom} onClick={() => onChange(fallback)}>
          Reset to default
        </Button>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        rows={14}
        maxLength={CHROME_HTML_MAX}
        className="w-full rounded-md border bg-background p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

/** The store's navbar and footer as HTML (Tailwind classes). Empty or equal to the default = the store keeps using the default. */
export const ChromeSection = ({ storeId, navbarHtml, footerHtml }: { storeId: string; navbarHtml: string; footerHtml: string }) => {
  const router = useRouter();
  const [navbar, setNavbar] = useState(navbarHtml || DEFAULT_NAVBAR_HTML);
  const [footer, setFooter] = useState(footerHtml || DEFAULT_FOOTER_HTML);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const invalid = validateChromeHtml(navbar) !== null || validateChromeHtml(footer) !== null;

  const onSave = async () => {
    if (invalid) return;
    setError("");
    setLoading(true);
    // Saving the default text stores "" so the store keeps following the default if it is improved later.
    const err = await patchSettings(`/api/${storeId}/chrome`, {
      navbarHtml: isDefault(navbar, DEFAULT_NAVBAR_HTML) ? "" : navbar,
      footerHtml: isDefault(footer, DEFAULT_FOOTER_HTML) ? "" : footer,
    });
    setLoading(false);
    if (err) {
      setError(err);
      return toast.error(err);
    }
    toast.success("Navbar and footer saved.");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Navbar &amp; Footer Code</CardTitle>
        <CardDescription>Edit the HTML (with Tailwind classes) of the header and footer shown on every page of your store.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <HtmlEditor
          id="navbar-html"
          label="Navbar HTML"
          hint="Slots: <store-logo />, <store-search />, <store-cart />, <store-account />. Variables: {{store.name}}, {{store.homeHref}}, {{#each categories}} ({{name}}, {{href}}), {{#each pages}} ({{title}}, {{href}})."
          value={navbar}
          fallback={DEFAULT_NAVBAR_HTML}
          onChange={setNavbar}
          disabled={loading}
        />
        <HtmlEditor
          id="footer-html"
          label="Footer HTML"
          hint="Variables: {{store.name}}, {{store.year}}, {{store.homeHref}}, {{store.cartHref}}, {{store.ordersHref}}, {{contact.phone}}, {{contact.whatsapp}}, {{#each categories}} ({{name}}, {{href}}), {{#each pages}} ({{title}}, {{href}}), {{#if ...}}."
          value={footer}
          fallback={DEFAULT_FOOTER_HTML}
          onChange={setFooter}
          disabled={loading}
        />
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" onClick={onSave} disabled={loading || invalid}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
};

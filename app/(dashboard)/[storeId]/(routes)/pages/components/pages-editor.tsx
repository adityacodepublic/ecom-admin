"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import { ExternalLink, Plus, Trash } from "lucide-react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PAGES, normalizeRoute, pageLabels, routeProblem, routeTakenMessage, type PageLayout, type PageName } from "@/lib/home-layout";
import type { Option } from "./section-form";
import { PageLayoutEditor } from "./page-layout-editor";

interface PagesEditorProps {
  layouts: Record<PageName, PageLayout>;
  /** The custom pages: route -> layout. */
  customPages: Record<string, PageLayout>;
  storeUrl: string;
  categories: Option[];
  products: Option[];
}

/** The tab value of a custom page (kept apart from the built-in page names). */
const customTab = (route: string) => `custom:${route}`;

const errorText = (error: unknown) => {
  const data = axios.isAxiosError(error) ? error.response?.data : null;
  return typeof data === "string" && data ? data : "Could not create the page.";
};

interface NewPageModalProps {
  storeId: string;
  storeUrl: string;
  /** The routes of the existing custom pages. */
  taken: string[];
  onCreated: (route: string) => void;
  onClose: () => void;
}

/** Asks for the route of a new custom page. Says at once when the route is taken or not allowed. */
const NewPageModal = ({ storeId, storeUrl, taken, onCreated, onClose }: NewPageModalProps) => {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const route = normalizeRoute(value);
  const problem = routeProblem(route) ?? (taken.includes(route) ? routeTakenMessage(route) : null);
  // An empty field shows no error until Create is pressed.
  const shown = (value.trim() || submitted ? problem : null) ?? serverError;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (problem) return;
    setLoading(true);
    try {
      await axios.post(`/api/${storeId}/page-layouts`, { route });
      toast.success(`Page /${route} created. Add blocks to it.`);
      onCreated(route);
    } catch (error) {
      setServerError(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="New page" description="A store page at its own address, built from blocks." isOpen onClose={onClose}>
      <form onSubmit={create} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-page-route">Route</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">/</span>
            <Input
              id="new-page-route"
              autoFocus
              autoComplete="off"
              placeholder="summer-sale"
              value={value}
              disabled={loading}
              aria-invalid={!!shown}
              onChange={(e) => {
                setValue(e.target.value);
                setServerError("");
              }}
            />
          </div>
          {shown ? (
            <p className="text-sm font-medium text-destructive">{shown}</p>
          ) : (
            <p className="break-all text-sm text-muted-foreground">
              The page will be at {storeUrl}/{route || "summer-sale"}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !!shown}>
            Create page
          </Button>
        </div>
      </form>
    </Modal>
  );
};

/** One tab per store page, then one per custom page. All tabs stay mounted, so switching never loses a page's state. */
export const PagesEditor = ({ layouts, customPages, ...rest }: PagesEditorProps) => {
  const { storeId } = useParams<{ storeId: string }>();
  const [routes, setRoutes] = useState<string[]>(Object.keys(customPages));
  const [tab, setTab] = useState<string>("home");
  const [creating, setCreating] = useState(false);
  const [deleteRoute, setDeleteRoute] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The custom page whose tab is open (its Delete page button sits at the end of the tab row).
  const activeRoute = tab.startsWith("custom:") ? tab.slice("custom:".length) : null;

  const onCreated = (route: string) => {
    setRoutes((r) => [...r, route].sort());
    setCreating(false);
    setTab(customTab(route));
  };

  const confirmDelete = async () => {
    if (!deleteRoute) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/${storeId}/page-layouts/${deleteRoute}`);
      setRoutes((r) => r.filter((x) => x !== deleteRoute));
      setTab("home");
      toast.success(`Page /${deleteRoute} deleted.`);
      setDeleteRoute(null);
    } catch {
      toast.error("Could not delete the page.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Heading title="Pages" description="Arrange the blocks of the store pages, top to bottom. Add your own pages with New page." />
      <Separator />
      {creating && <NewPageModal storeId={storeId} storeUrl={rest.storeUrl} taken={routes} onCreated={onCreated} onClose={() => setCreating(false)} />}
      <AlertModal isOpen={deleteRoute !== null} onClose={() => setDeleteRoute(null)} onConfirm={confirmDelete} loading={deleting} />
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="h-auto flex-wrap justify-start">
            {PAGES.map((page) => (
              <TabsTrigger key={page} value={page}>
                {pageLabels[page]}
              </TabsTrigger>
            ))}
            {routes.map((route) => (
              <TabsTrigger key={route} value={customTab(route)}>
                {route}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New page
          </Button>
          {activeRoute && (
            <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setDeleteRoute(activeRoute)}>
              <Trash className="mr-1.5 h-4 w-4" /> Delete page
            </Button>
          )}
        </div>
        {PAGES.map((page) => (
          <TabsContent key={page} value={page} forceMount className="data-[state=inactive]:hidden">
            <PageLayoutEditor page={page} initialLayout={layouts[page]} {...rest} />
          </TabsContent>
        ))}
        {routes.map((route) => (
          <TabsContent key={route} value={customTab(route)} forceMount className="space-y-4 data-[state=inactive]:hidden">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">This page is at</span>
              <a
                href={`${rest.storeUrl}/${route}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 break-all font-medium underline-offset-4 hover:underline"
              >
                {rest.storeUrl}/{route} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            </div>
            <PageLayoutEditor page="custom" route={route} initialLayout={customPages[route] ?? []} {...rest} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
};

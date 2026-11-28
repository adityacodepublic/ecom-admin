"use client";

import { Info, MessageCircle, Phone, ShoppingCart, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QUOTE_BUTTON_PRESETS, QUOTE_PRICE_PRESETS } from "@/lib/orders/settings";
import { cn } from "@/lib/utils";

export type HelpTopic = "priceText" | "quoteButton" | "secondaryHeading";

const SPOTLIGHT = "ring-2 ring-sky-500/80 bg-sky-500/10 text-foreground";

const HelpBadge = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
    {children}
  </span>
);

const PriceTextMockup = ({ value }: { value: string }) => {
  const label = value.trim() || QUOTE_PRICE_PRESETS[0];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="rounded-md border bg-background p-2.5">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Product card</p>
        <div className="mb-2 h-11 rounded bg-muted/70" />
        <p className="truncate text-[11px] font-medium">Sample product</p>
        <div className={cn("mt-1 inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-semibold", SPOTLIGHT)}>
          {label}
        </div>
      </div>
      <div className="rounded-md border bg-background p-2.5">
        <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Product page</p>
        <p className="truncate text-[11px] font-semibold">Sample product</p>
        <div className={cn("mt-1 inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-semibold", SPOTLIGHT)}>
          {label}
        </div>
        <div className="mt-2.5 flex gap-1">
          <span className="h-4 flex-1 rounded-full bg-muted" />
          <span className="h-4 flex-1 rounded-full bg-amber-300/70" />
        </div>
        <div className="mt-1.5 h-6 rounded bg-muted/50" />
      </div>
    </div>
  );
};

const QuoteButtonMockup = ({ value }: { value: string }) => {
  const label = value.trim() || QUOTE_BUTTON_PRESETS[0];
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold">Checkout</p>
        <HelpBadge>Submit button</HelpBadge>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Sample product × 1</span>
          <span>Price on request</span>
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-1 pt-0.5">
          <div className="h-2.5 w-2/3 rounded bg-muted/70" />
          <div className="h-2.5 w-1/2 rounded bg-muted/50" />
        </div>
      </div>
      <div className={cn("mt-3 flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium", SPOTLIGHT)}>
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
};

const SecondaryHeadingMockup = ({ value }: { value: string }) => {
  const heading = value.trim();
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-[11px] font-semibold">Sample product</p>
      <p className="text-[11px] text-muted-foreground">₹1,499</p>
      <div className="mt-2 flex gap-1.5">
        <span className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-full border bg-muted/40 text-[10px] text-muted-foreground">
          Add to cart <ShoppingCart className="h-2.5 w-2.5" />
        </span>
        <span className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-full bg-amber-300/60 text-[10px] text-slate-900">
          Buy now <Zap className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="mt-2.5 rounded-lg border bg-muted/30 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-1.5">
          <span
            className={cn(
              "truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
              SPOTLIGHT,
              !heading && "italic text-muted-foreground",
            )}
          >
            {heading || "No heading shown"}
          </span>
          <HelpBadge>Secondary box</HelpBadge>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <span className="inline-flex h-6 items-center justify-center gap-1 rounded border bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
            WhatsApp <MessageCircle className="h-2.5 w-2.5" />
          </span>
          <span className="inline-flex h-6 items-center justify-center gap-1 rounded border bg-background text-[10px] text-muted-foreground">
            Call <Phone className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </div>
  );
};

const HELP_META: Record<HelpTopic, { title: string; description: string }> = {
  priceText: {
    title: "Text in place of the price",
    description: "Replaces the price on product cards, the product page, and the cart for products without a price.",
  },
  quoteButton: {
    title: "Checkout button text",
    description: "The button customers click at checkout to send a request. Also the default label for Buy now on these products.",
  },
  secondaryHeading: {
    title: "Secondary box heading",
    description: "Shown above the buttons placed in Secondary. Leave empty to hide the heading.",
  },
};

/** Small info icon that opens a dark/light mini-mockup highlighting where the field appears on the storefront. */
export const FieldHelp = ({ topic, value = "" }: { topic: HelpTopic; value?: string }) => {
  const meta = HELP_META[topic];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Where "${meta.title}" appears`}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 space-y-2.5 p-3.5">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold">{meta.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{meta.description}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-2.5">
          {topic === "priceText" && <PriceTextMockup value={value} />}
          {topic === "quoteButton" && <QuoteButtonMockup value={value} />}
          {topic === "secondaryHeading" && <SecondaryHeadingMockup value={value} />}
        </div>
      </PopoverContent>
    </Popover>
  );
};

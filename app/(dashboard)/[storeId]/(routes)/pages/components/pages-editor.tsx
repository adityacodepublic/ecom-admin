"use client";

import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PAGES, pageLabels, type PageLayout, type PageName } from "@/lib/home-layout";
import type { Option } from "./section-form";
import { PageLayoutEditor } from "./page-layout-editor";

interface PagesEditorProps {
  layouts: Record<PageName, PageLayout>;
  storeUrl: string;
  categories: Option[];
  products: Option[];
}

/** One tab per store page. All tabs stay mounted, so switching never loses a page's state. */
export const PagesEditor = ({ layouts, ...rest }: PagesEditorProps) => (
  <>
    <Heading title="Pages" description="Arrange the blocks of the home, category and product pages, top to bottom" />
    <Separator />
    <Tabs defaultValue="home">
      <TabsList>
        {PAGES.map((page) => (
          <TabsTrigger key={page} value={page}>
            {pageLabels[page]}
          </TabsTrigger>
        ))}
      </TabsList>
      {PAGES.map((page) => (
        <TabsContent key={page} value={page} forceMount className="data-[state=inactive]:hidden">
          <PageLayoutEditor page={page} initialLayout={layouts[page]} {...rest} />
        </TabsContent>
      ))}
    </Tabs>
  </>
);

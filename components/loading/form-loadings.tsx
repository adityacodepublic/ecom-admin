import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { HeadingLoading, IconButtonLoading, PageFrame, SaveButtonLoading, SeparatorLoading } from "./page-loadings";

/**
 * The edit/create form pages: the heading with its delete button, the line, then one block per form field, in the
 * same grids as the form. Field heights are those of an empty-ish form; fields that list images or values grow with them.
 */

export const CategoryFormLoading = () => (
  <PageFrame>
    <HeadingLoading titleW="w-44" descW="w-[186px]" wrapDesc={false} action={<IconButtonLoading />} />
    <SeparatorLoading />
    <div className="space-y-8">
      <Skeleton className="h-16 w-full md:w-[calc((100%-4rem)/3)]" />
      <Skeleton className="h-[137px] w-full max-w-2xl sm:h-[117px]" />
      <Skeleton className="h-[360px] sm:h-[340px]" />
      <SaveButtonLoading />
    </div>
  </PageFrame>
);

export const FilterFormLoading = () => (
  <PageFrame>
    <HeadingLoading titleW="w-32" descW="w-[144px]" wrapDesc={false} action={<IconButtonLoading />} />
    <SeparatorLoading />
    <div className="space-y-8">
      <div className="space-y-8 md:grid md:grid-cols-2 md:gap-8 md:space-y-0">
        <Skeleton className="h-16 md:h-[72px]" />
        <div className="h-[72px]">
          <Skeleton className="mt-6 h-12 w-[132px]" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[73px]" />
        ))}
      </div>
      <SaveButtonLoading />
    </div>
  </PageFrame>
);

// The product form's seven fields (name, price, quantity, limit, category, featured, archived): their heights on phones, then from md up.
const PRODUCT_FIELDS = ["h-16 md:h-[140px]", "h-[140px]", "h-16 md:h-[140px]", "h-16 md:h-[72px]", "h-16 md:h-[72px]", "h-[89px] md:h-[72px]", "h-[89px] md:h-[69px]"];

export const ProductFormLoading = () => (
  <PageFrame>
    <HeadingLoading titleW="w-40" descW="w-[169px]" wrapDesc={false} action={<IconButtonLoading />} />
    <SeparatorLoading />
    <div className="space-y-8">
      <Skeleton className="h-[312px]" />
      <div className="space-y-4 md:grid md:grid-cols-3 md:gap-8">
        {PRODUCT_FIELDS.map((h, i) => (
          <Skeleton key={i} className={h} />
        ))}
      </div>
      <Separator className="h-[0.5px]" />
      <div className="gap-8 md:grid md:grid-cols-3">
        <Skeleton className="mb-4 h-11 md:h-[224px]" />
        <Skeleton className="h-[240px] md:col-span-2" />
      </div>
      <Skeleton className="h-[233px] md:h-[213px]" />
      <SaveButtonLoading />
    </div>
  </PageFrame>
);

/** One order: the heading cluster, the line, then the cards of the left column (items, ...) and the right column. */
export const OrderViewLoading = () => {
  const cards = (heights: string[]) => heights.map((h, i) => <Skeleton key={i} className={cn("rounded-lg", h)} />);
  return (
    <PageFrame fluid>
      <Skeleton className="h-[101px] w-full sm:h-[85px] sm:w-[395px]" />
      <SeparatorLoading />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">{cards(["h-[436px] lg:h-[376px]", "h-[121px]", "h-[157px] lg:h-[137px]"])}</div>
        <div className="space-y-4">{cards(["h-[209px]", "h-[270px]", "h-[143px]", "h-[113px]", "h-[137px]"])}</div>
      </div>
    </PageFrame>
  );
};

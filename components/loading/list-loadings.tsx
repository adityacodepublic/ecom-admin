import { Skeleton } from "@/components/ui/skeleton";

import { ButtonLoading, HeadingLoading, PageFrame, SeparatorLoading, TableLoading } from "./page-loadings";

/**
 * The list pages' content (heading, line, table): the Suspense fallback of each page, and, inside a PageFrame, its
 * loading.tsx. A table block is as tall as a full page of rows; the real table is shorter when it has fewer rows.
 */

export const CategoriesContentLoading = () => (
  <>
    <HeadingLoading titleW="w-48" descW="w-[212px] sm:w-[220px]" action={<ButtonLoading />} />
    <SeparatorLoading />
    <TableLoading rows={5} />
  </>
);

export const FiltersContentLoading = () => (
  <>
    <HeadingLoading titleW="w-40" descW="w-[210px] sm:w-[213px]" action={<ButtonLoading />} />
    <SeparatorLoading />
    <TableLoading rows={5} />
  </>
);

export const ProductsContentLoading = () => (
  <>
    <HeadingLoading titleW="w-44" descW="w-[429px] max-w-full" className="flex flex-wrap items-center justify-between gap-2.5" action={<ButtonLoading />} />
    <SeparatorLoading className="my-5" />
    <TableLoading rows={10} rowHeight={64.8} pager />
  </>
);

/** The orders list: the filters, a table on wide screens, a list of cards on phones, and the pager. */
export const OrdersContentLoading = () => (
  <>
    <HeadingLoading titleW="w-40" descW="w-[200px]" wrapDesc={false} />
    <SeparatorLoading />
    <div className="space-y-3">
      <Skeleton className="h-10 w-full sm:max-w-md" />
      <Skeleton className="h-[70px] md:hidden" />
      <Skeleton className="h-4 w-[182px]" />
    </div>
    <div className="hidden md:block">
      <TableLoading rows={20} rowHeight={88.15} search={false} />
    </div>
    <div className="grid gap-3 md:hidden">
      {Array.from({ length: 20 }, (_, i) => (
        <Skeleton key={i} className="h-[181px]" />
      ))}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Skeleton className="h-5 w-[129px]" />
      <Skeleton className="h-9 w-[269px]" />
    </div>
  </>
);

/** The customers list: the search box, then the table (not boxed together, unlike the other lists). */
export const UsersContentLoading = () => (
  <>
    <HeadingLoading titleW="w-44" descW="w-full max-w-[640px]" />
    <SeparatorLoading />
    <Skeleton className="h-10 w-full max-w-sm" />
    <TableLoading rows={10} rowHeight={49} search={false} />
  </>
);

export const CategoriesLoading = () => (
  <PageFrame>
    <CategoriesContentLoading />
  </PageFrame>
);
export const FiltersLoading = () => (
  <PageFrame>
    <FiltersContentLoading />
  </PageFrame>
);
export const ProductsLoading = () => (
  <PageFrame>
    <ProductsContentLoading />
  </PageFrame>
);
export const OrdersLoading = () => (
  <PageFrame fluid>
    <OrdersContentLoading />
  </PageFrame>
);
export const UsersLoading = () => (
  <PageFrame fluid>
    <UsersContentLoading />
  </PageFrame>
);

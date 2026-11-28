import { Skeleton } from "@/components/ui/skeleton";

import { HeadingLoading, PageFrame, SeparatorLoading } from "./page-loadings";

/** The settings page: the heading, then each group of settings as one block under its title. */
export const SettingsLoading = () => {
  const title = (
    <div className="pt-4">
      <Skeleton className="h-7 w-24" />
    </div>
  );
  return (
    <PageFrame fluid>
      <HeadingLoading titleW="w-48" />
      <SeparatorLoading />
      <Skeleton className="h-[324px] rounded-lg" />
      {title}
      <Skeleton className="h-[65px] rounded-lg" />
      {title}
      <Skeleton className="h-[429px] rounded-lg md:h-[389px]" />
      {title}
      <Skeleton className="h-[65px] rounded-lg" />
      {title}
      <Skeleton className="h-[130px] rounded-lg" />
    </PageFrame>
  );
};

/** The pages editor: the heading, the page tabs with "New page", then the toolbar and the page's blocks. */
export const PagesLoading = () => (
  <PageFrame>
    <HeadingLoading titleW="w-28" descW="w-[330px]" />
    <SeparatorLoading />
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-[72px] w-full sm:h-10 sm:w-[387px]" />
        <Skeleton className="h-9 w-[115px]" />
      </div>
      <div className="mt-2 space-y-4">
        <Skeleton className="h-[41px]" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[217px] rounded-lg" />
        ))}
      </div>
    </div>
  </PageFrame>
);

import { HeadingLoading, PageFrame, SeparatorLoading } from "@/components/loading/page-loadings";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic route-level loading skeleton for store admin pages: a heading, separator, and full-width
 * card blocks that refine cleanly into any child route's specific skeleton (Dashboard, Orders, Products, etc.).
 */
const Loading = () => (
  <PageFrame fluid>
    <HeadingLoading titleW="w-44" descW="w-60" wrapDesc={false} />
    <SeparatorLoading />
    <div className="space-y-4">
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-44 w-full rounded-lg" />
      <Skeleton className="h-44 w-full rounded-lg" />
    </div>
  </PageFrame>
);

export default Loading;

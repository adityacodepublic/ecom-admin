import { Skeleton } from "@/components/ui/skeleton";

/**
 * The navbar (components/navbar.tsx) while it loads: the store switcher, the links (large screens only), and on the
 * right the menu button (not on large screens), the theme button and the account picture. Same wrapper as the navbar.
 */
export const NavbarLoading = () => (
  <div className="border-b" role="status" aria-label="Loading">
    <div className="flex h-16 items-center px-4">
      <Skeleton className="h-9 w-[200px]" />
      <div className="mx-6 hidden lg:block">
        <Skeleton className="h-5 w-[621px]" />
      </div>
      <div className="ml-auto flex items-center space-x-4">
        <div className="lg:hidden">
          <Skeleton className="h-10 w-10" />
        </div>
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-7 w-7 rounded-full" />
      </div>
    </div>
  </div>
);

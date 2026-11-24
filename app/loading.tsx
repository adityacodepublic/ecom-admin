import { Skeleton } from "@/components/ui/skeleton";

/** Before the app knows which page this is (sign-in, store setup): one block the size of the card those pages show. */
const Loading = () => (
  <div className="flex h-full w-full items-center justify-center p-4" role="status" aria-label="Loading">
    <Skeleton className="h-[480px] w-[400px] max-w-full rounded-xl" />
  </div>
);

export default Loading;

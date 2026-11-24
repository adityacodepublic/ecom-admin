import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/** True after client hydration; false during SSR and the initial hydration pass. */
export function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
const getOrigin = () => (typeof window !== 'undefined' && window.location.origin ? window.location.origin : '');

export const useOrigin = () => useSyncExternalStore(emptySubscribe, getOrigin, () => '');

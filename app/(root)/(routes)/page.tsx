"use client";

import { useEffect } from "react";

import { useMounted } from "@/hooks/use-mounted";
import { useStoreModal } from "@/hooks/use-store-modal";

const SetupPage = () => {
  const onOpen = useStoreModal((state) => state.onOpen);
  const isOpen = useStoreModal((state) => state.isOpen);
  const isMounted = useMounted();

  useEffect(() => {
    if (!isOpen) {
      onOpen();
    }
  }, [isOpen, onOpen]);

  if (!isMounted) {
    return null;
  }

  return null;
};
 
export default SetupPage;

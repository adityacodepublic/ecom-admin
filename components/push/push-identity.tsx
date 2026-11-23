"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

import { syncPushUser } from "@/lib/push-client";

/**
 * Keeps push in this browser linked to the owner who is signed in: on sign-in it links them, on sign-out it unlinks
 * (so a shared device stops getting another owner's orders). Does nothing (and loads nothing) in a browser that never
 * turned push on.
 */
export function PushIdentity() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    syncPushUser(userId ?? null).catch((error) => console.error("[push]", error));
  }, [isLoaded, userId]);
  return null;
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "react-hot-toast";

import { Switch } from "@/components/ui/switch";
import { disablePush, enablePush, pushConfigured, pushRemembered, pushState, type PushState } from "@/lib/push-client";

/**
 * Settings row: notifications on this device (new orders, quote requests and answers, cancellations, returns).
 * Per device: each phone or computer is turned on by itself. Hidden when push is not set up.
 */
export function PushSetting() {
  const { userId } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!pushConfigured() || !pushRemembered()) return;
    let live = true;
    pushState()
      .then((s) => live && setState(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!pushConfigured() || !userId) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      const next = on ? await enablePush(userId) : await disablePush();
      setState(next);
      toast.success(next.on ? "Notifications are on for this device." : "Notifications are off for this device.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not turn notifications on. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Notifications on this device</p>
        <p className="text-sm text-muted-foreground">New orders, quote requests and answers, cancellations and returns. Turn it on on each phone or computer.</p>
        {note && (
          <p role="status" className="mt-1 text-sm text-destructive">
            {note}
          </p>
        )}
      </div>
      <Switch checked={state?.on ?? false} disabled={busy} onCheckedChange={toggle} aria-label="Notifications on this device" className="mt-1 shrink-0" />
    </div>
  );
}

"use client";

import { ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** A bordered list of settings, one row each. */
export const SettingsList = ({ children }: { children: ReactNode }) => <div className="divide-y rounded-lg border">{children}</div>;

/** One setting: its name, a short summary of the current value, and an action (Edit button or a switch). */
export const SettingRow = ({ title, summary, action }: { title: string; summary?: string; action: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3">
    <div className="min-w-0">
      <p className="text-sm font-medium">{title}</p>
      {summary && <p className="truncate text-sm text-muted-foreground">{summary}</p>}
    </div>
    <div className="shrink-0">{action}</div>
  </div>
);

export const EditButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <Button type="button" variant="outline" size="sm" onClick={onClick} aria-label={label}>
    Edit
  </Button>
);

/** A form in a modal with its own Save. The content is mounted only while open, so it starts from the saved values every time. */
export const SettingsModal = ({
  title,
  isOpen,
  onClose,
  onSave,
  loading,
  error,
  saveDisabled,
  className,
  children,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
  error?: string;
  saveDisabled?: boolean;
  /** Extra classes for the dialog, e.g. a wider max width. */
  className?: string;
  children: ReactNode;
}) => (
  <Modal title={title} description="" isOpen={isOpen} onClose={onClose} className={cn("max-h-[90vh] overflow-y-auto sm:max-w-lg", className)}>
    <div className="space-y-5">
      <div className="flex flex-col gap-7">{children}</div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={loading || saveDisabled} onClick={onSave}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  </Modal>
);

/** PATCH helper for the settings modals: returns an error text, or null when it worked. */
export async function patchSettings(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    const fe = data?.error?.details?.fieldErrors as Record<string, string[]> | undefined;
    return Object.values(fe ?? {})[0]?.[0] || data?.error?.message || "Could not save. Try again.";
  } catch {
    return "Could not reach the server. Try again.";
  }
}

/** Open/close state for one modal. */
export const useOpen = () => {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
};

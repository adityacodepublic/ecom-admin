"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteStoreModalProps {
  storeName: string;
  storeUrl: string;
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Deleting a store is not like deleting a row: it removes the whole store, so the owner types its name to confirm. */
export const DeleteStoreModal = ({ storeName, storeUrl, isOpen, loading, onClose, onConfirm }: DeleteStoreModalProps) => {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (isOpen) setTyped("");
  }, [isOpen]);

  const matches = typed.trim() === storeName;

  return (
    <Modal
      title={`Delete the store "${storeName}"?`}
      description="This deletes the entire store, not only this page."
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-4 py-2">
        <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-2">
            <p>
              The store, its settings and its home page are permanently deleted. The store URL{" "}
              <span className="font-medium break-all">{storeUrl}</span> stops working at once, and another store can
              take that name.
            </p>
            <p>
              A store that still has products, categories, filters, customers or orders cannot be deleted:
              remove those first. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-store-name">
            Type <span className="font-semibold">{storeName}</span> to confirm
          </Label>
          <Input
            id="confirm-store-name"
            value={typed}
            disabled={loading}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={loading || !matches} onClick={onConfirm}>
            Delete store
          </Button>
        </div>
      </div>
    </Modal>
  );
};

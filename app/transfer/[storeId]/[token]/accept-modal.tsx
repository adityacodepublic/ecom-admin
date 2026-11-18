"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type State =
  | { kind: "ok"; storeName: string }
  | { kind: "wrong_account"; email: string }
  | { kind: "invalid" }
  | { kind: "expired" };

const MESSAGE = {
  invalid: "This link is no longer valid. Ask the owner for a new one.",
  expired: "This link has expired. Ask the owner for a new one.",
} as const;

/** "Add this store to your account?" for the invited person. */
export const AcceptModal = ({ state, storeId, token }: { state: State; storeId: string; token: string }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const leave = () => router.push("/");

  const accept = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/transfer/${storeId}/${token}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoading(false);
        const e = data?.error;
        return setError((typeof e === "string" ? e : e?.message) || "Something went wrong. Try again.");
      }
      router.push(`/${storeId}`);
      router.refresh();
    } catch {
      setLoading(false);
      setError("Could not reach the server. Try again.");
    }
  };

  if (state.kind !== "ok") {
    return (
      <Modal title="Store transfer" description="" isOpen onClose={leave}>
        <div className="space-y-5">
          <p className="text-sm">
            {state.kind === "wrong_account"
              ? `This store was offered to ${state.email}. Sign in with that email to accept it.`
              : MESSAGE[state.kind]}
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={leave}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add this store to your account?" description="" isOpen onClose={leave}>
      <div className="space-y-5">
        <p className="text-sm">
          You have been offered <span className="font-medium">{state.storeName}</span>. If you accept, you become its owner and the
          previous owner loses access. Your other stores are not affected.
        </p>
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={loading} onClick={leave}>
            Not now
          </Button>
          <Button type="button" disabled={loading} onClick={accept}>
            {loading ? "Adding..." : "Add to my account"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

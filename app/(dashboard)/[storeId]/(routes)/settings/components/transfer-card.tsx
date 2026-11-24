"use client";

import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

import { SettingRow, SettingsList, SettingsModal, useOpen } from "./setting-row";

type Pending = { email: string; createdAt: string; expired: boolean } | null;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

async function call(url: string, init?: RequestInit): Promise<{ data: any; error: string | null }> {
  try {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    if (res.ok) return { data, error: null };
    const e = data?.error;
    return { data: null, error: (typeof e === "string" ? e : e?.message) || "Something went wrong. Try again." };
  } catch {
    return { data: null, error: "Could not reach the server. Try again." };
  }
}

// ---------------------------------------------------------------- start

const StartModal = ({ storeId, onClose, onCreated }: { storeId: string; onClose: () => void; onCreated: (url: string, email: string) => void }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setError("");
    setLoading(true);
    const { data, error: err } = await call(`/api/${storeId}/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (err || !data?.url) return setError(err ?? "Could not create the link. Try again.");
    onCreated(data.url, data.email);
  };

  return (
    <SettingsModal title="Transfer this store" isOpen onClose={onClose} onSave={start} loading={loading} error={error} saveDisabled={!email.trim()}>
      <div className="grid gap-2">
        <label htmlFor="transfer-email" className="text-sm font-medium">
          New owner&apos;s email
        </label>
        <Input
          id="transfer-email"
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          value={email}
          disabled={loading}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Send the transfer link to the new owner. Only this store moves; you lose access to it, and its agent link is removed.
        </p>
      </div>
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- created (shown once)

const CreatedModal = ({ url, email, onClose }: { url: string; email: string; onClose: () => void }) => {
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied."),
      () => toast.error("Could not copy. Select the text and copy it."),
    );
  return (
    <Modal title="Send this link" description="" isOpen onClose={onClose} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <div className="space-y-6">
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Transfer link" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Only {email} can accept it, valid for 7 days. Shown only once. Copy it now.
          </p>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- manage a pending transfer

const ManageModal = ({ storeId, pending, onClose, onCancelled }: { storeId: string; pending: NonNullable<Pending>; onClose: () => void; onCancelled: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cancel = async () => {
    setError("");
    setLoading(true);
    const { error: err } = await call(`/api/${storeId}/transfer`, { method: "DELETE" });
    setLoading(false);
    if (err) return setError(err);
    onCancelled();
  };

  return (
    <Modal title="Transfer in progress" description="" isOpen onClose={onClose} className="sm:max-w-lg">
      <div className="space-y-5">
        <p className="text-sm">
          Waiting for <span className="font-medium">{pending.email}</span> to accept. Started {formatDate(pending.createdAt)}
          {pending.expired ? " · the link has expired." : "."} The link is not stored, so it cannot be shown again. To send a new one, cancel
          this and start again.
        </p>
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="destructive" disabled={loading} onClick={cancel}>
            {loading ? "Cancelling..." : "Cancel transfer"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- the row

/** Handing this one store to another account, as one settings row. */
export const TransferCard = ({ storeId }: { storeId: string }) => {
  const [pending, setPending] = useState<Pending | undefined>(undefined); // undefined = loading
  const [failed, setFailed] = useState(false);
  const start = useOpen();
  const manage = useOpen();
  const [created, setCreated] = useState<{ url: string; email: string } | null>(null);

  const applyPending = useCallback((data: any, error: string | null) => {
    if (error || !data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setPending(data.pending ? { email: data.email, createdAt: data.createdAt, expired: !!data.expired } : null);
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await call(`/api/${storeId}/transfer`);
    applyPending(data, error);
  }, [storeId, applyPending]);

  useEffect(() => {
    let cancelled = false;
    call(`/api/${storeId}/transfer`).then(({ data, error }) => {
      if (!cancelled) applyPending(data, error);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, applyPending]);

  const summary = failed
    ? "Could not load."
    : pending === undefined
      ? "Loading..."
      : pending
        ? `Waiting for ${pending.email}${pending.expired ? " (expired)" : ""}`
        : "Give this store to another account";

  return (
    <>
      <SettingsList>
        <SettingRow
          title="Transfer store"
          summary={summary}
          action={
            failed ? (
              <Button type="button" variant="outline" size="sm" onClick={load}>
                Retry
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={pending === undefined} onClick={pending ? manage.show : start.show}>
                {pending ? "Manage" : "Transfer"}
              </Button>
            )
          }
        />
      </SettingsList>
      {start.open && (
        <StartModal
          storeId={storeId}
          onClose={start.hide}
          onCreated={(url, email) => {
            start.hide();
            setCreated({ url, email });
            load();
          }}
        />
      )}
      {created && <CreatedModal url={created.url} email={created.email} onClose={() => setCreated(null)} />}
      {manage.open && pending && (
        <ManageModal
          storeId={storeId}
          pending={pending}
          onClose={manage.hide}
          onCancelled={() => {
            manage.hide();
            load();
          }}
        />
      )}
    </>
  );
};

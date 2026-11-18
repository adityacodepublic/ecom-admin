"use client";

import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

import { SettingRow, SettingsList, SettingsModal, useOpen } from "./setting-row";

type Mode = "full" | "permission";
type LogEntry = { at: string; method: string; path: string; status: number; outcome: "ok" | "error" | "blocked" | "pending" };
type LinkState = { exists: boolean; mode: Mode | null; createdAt: string | null; log: LogEntry[] };

const MODE_LABEL: Record<Mode, string> = { full: "Full access", permission: "Ask me first" };
const MODE_HELP: Record<Mode, string> = {
  full: "The agent can make changes right away.",
  permission: "The agent can look around. Any change waits for your approval.",
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

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

// ---------------------------------------------------------------- create

const CreateModal = ({ storeId, onClose, onCreated }: { storeId: string; onClose: () => void; onCreated: (url: string) => void }) => {
  const [mode, setMode] = useState<Mode>("permission");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setError("");
    setLoading(true);
    const { data, error: err } = await call(`/api/${storeId}/agent-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setLoading(false);
    if (err || !data?.url) return setError(err ?? "Could not create the link. Try again.");
    onCreated(data.url);
  };

  return (
    <SettingsModal title="Create agent link" isOpen onClose={onClose} onSave={create} loading={loading} error={error}>
      <div className="grid gap-3" role="radiogroup" aria-label="Access">
        {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={loading}
            onClick={() => setMode(m)}
            className={cn("rounded-lg border p-4 text-left transition-colors hover:bg-muted/50", mode === m && "border-primary bg-muted/50")}
          >
            <p className="text-sm font-medium">{MODE_LABEL[m]}</p>
            <p className="mt-1 text-sm text-muted-foreground">{MODE_HELP[m]}</p>
          </button>
        ))}
      </div>
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- created (shown once)

const CreatedModal = ({ url, onClose }: { url: string; onClose: () => void }) => {
  const instruction = `Read the skill at ${url}/skill and follow it`;
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied.`),
      () => toast.error("Could not copy. Select the text and copy it.")
    );
  };
  return (
    <Modal title="Your agent link" description="" isOpen onClose={onClose} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <div className="space-y-6">
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Agent link" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" size="icon" onClick={() => copy(url, "Link")} aria-label="Copy link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Shown only once. Copy it now.</p>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">Paste this to your agent</p>
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 break-all rounded-md border bg-muted/50 p-3 text-sm">{instruction}</p>
            <Button type="button" variant="outline" size="icon" onClick={() => copy(instruction, "Message")} aria-label="Copy message">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
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

// ---------------------------------------------------------------- manage

const OUTCOME_LABEL: Record<LogEntry["outcome"], string> = { ok: "Done", error: "Failed", blocked: "Blocked", pending: "Waiting for you" };

const ManageModal = ({ storeId, link, onClose, onDeleted }: { storeId: string; link: LinkState; onClose: () => void; onDeleted: () => void }) => {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setError("");
    setLoading(true);
    const { error: err } = await call(`/api/${storeId}/agent-link`, { method: "DELETE" });
    setLoading(false);
    if (err) return setError(err);
    toast.success("Link deleted.");
    onDeleted();
  };

  const log = link.log;
  return (
    <Modal title="Agent access" description="" isOpen onClose={onClose} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {link.mode ? MODE_LABEL[link.mode] : ""}
          {link.createdAt ? ` · created ${formatDate(link.createdAt)}` : ""}
        </p>
        <div className="grid gap-2">
          <p className="text-sm font-medium">Recent activity</p>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in the last 30 minutes.</p>
          ) : (
            <ul className="max-h-60 divide-y overflow-y-auto rounded-md border text-sm">
              {log.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{e.method}</span> <span className="text-muted-foreground">/{e.path.replace(/^\//, "")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {OUTCOME_LABEL[e.outcome]} · {formatTime(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {confirming ? (
          <div className="space-y-4">
            <p className="text-sm">Delete this link? The agent loses access right away.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={loading} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={loading} onClick={remove}>
                {loading ? "Deleting..." : "Delete link"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
              Delete link
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- the row

/** Agent access as one settings row: create a link, or see activity and delete it. */
export const AgentAccessCard = ({ storeId }: { storeId: string }) => {
  const [link, setLink] = useState<LinkState | null>(null);
  const [failed, setFailed] = useState(false);
  const create = useOpen();
  const manage = useOpen();
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await call(`/api/${storeId}/agent-link`);
    if (error || !data) return setFailed(true);
    setLink({ exists: !!data.exists, mode: data.mode ?? null, createdAt: data.createdAt ?? null, log: data.log ?? [] });
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = failed
    ? "Could not load."
    : !link
      ? "Loading..."
      : link.exists && link.mode
        ? `${MODE_LABEL[link.mode]} · created ${link.createdAt ? formatDate(link.createdAt) : ""}`
        : "No link";

  const openManage = () => {
    load();
    manage.show();
  };

  return (
    <>
      <SettingsList>
        <SettingRow
          title="Agent access"
          summary={summary}
          action={
            failed ? (
              <Button type="button" variant="outline" size="sm" onClick={load}>
                Retry
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={!link} onClick={link?.exists ? openManage : create.show}>
                {link?.exists ? "Manage" : "Create link"}
              </Button>
            )
          }
        />
      </SettingsList>
      {create.open && (
        <CreateModal
          storeId={storeId}
          onClose={create.hide}
          onCreated={(url) => {
            create.hide();
            setCreatedUrl(url);
            load();
          }}
        />
      )}
      {createdUrl && <CreatedModal url={createdUrl} onClose={() => setCreatedUrl(null)} />}
      {manage.open && link?.exists && (
        <ManageModal
          storeId={storeId}
          link={link}
          onClose={manage.hide}
          onDeleted={() => {
            manage.hide();
            load();
          }}
        />
      )}
    </>
  );
};

"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

import { parseQuery, summarize } from "./describe";
import { JsonTree } from "./json-tree";
import type { Lookups } from "./lookups";

type AgentRequest = {
  id: string;
  method: string;
  path: string;
  query?: unknown;
  body?: unknown;
  status: "pending" | "approved" | "denied" | "failed";
  createdAt: string;
  result?: { status: number; body: unknown };
};

type Load = { state: "loading" } | { state: "missing" } | { state: "error" } | { state: "ready"; request: AgentRequest };

const Notice = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
    {children}
  </div>
);

/** Small bodies are shown fully open; big ones start collapsed one level down. */
const hasBody = (b: unknown) => b !== undefined && b !== null && !(typeof b === "object" && Object.keys(b as object).length === 0);

export const AgentRequestModal = ({ storeId, requestId, lookups }: { storeId: string; requestId: string; lookups: Lookups }) => {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/${storeId}/agent-requests/${requestId}`);
        if (cancelled) return;
        if (res.status === 404) return setLoad({ state: "missing" });
        if (!res.ok) return setLoad({ state: "error" });
        setLoad({ state: "ready", request: await res.json() });
      } catch {
        if (!cancelled) setLoad({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, requestId]);

  const close = () => router.push(`/${storeId}/settings`);

  const decide = async (decision: "allow" | "deny") => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/${storeId}/agent-requests/${requestId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 404 || res.status === 409) {
        setLoad({ state: "missing" });
      } else if (!res.ok) {
        const e = data?.error;
        setError((typeof e === "string" ? e : e?.message) || "Something went wrong. Try again.");
      } else if (load.state === "ready") {
        setLoad({ state: "ready", request: { ...load.request, status: data?.status ?? (decision === "allow" ? "approved" : "denied"), result: data?.result } });
      }
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  };

  let content: React.ReactNode;
  if (load.state === "loading") {
    content = <Notice>Loading...</Notice>;
  } else if (load.state === "error") {
    content = <Notice>Could not load this request. Refresh to try again.</Notice>;
  } else if (load.state === "missing") {
    content = <Notice>This request has expired or was already decided. Ask the agent to send it again.</Notice>;
  } else {
    const r = load.request;
    const s = summarize(r, lookups);
    const query = parseQuery(r.query);
    const showBody = hasBody(r.body);
    const small = JSON.stringify(r.body ?? null).length <= 1500;
    const decided = r.status !== "pending";
    content = (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={s.destructive ? "destructive" : "secondary"}>{r.method}</Badge>
            <span className="text-xs text-muted-foreground">An agent is asking to</span>
          </div>
          <p className={cn("text-lg font-semibold leading-snug", s.destructive && "text-destructive")}>{s.title}</p>
          {s.destructive && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>This deletes data</AlertTitle>
              <AlertDescription>Allowing it removes this {s.subject.toLowerCase()} for good. It cannot be undone.</AlertDescription>
            </Alert>
          )}
        </div>

        {s.fields.length > 0 && (
          <Section title="What will be set">
            <dl className="divide-y rounded-md border text-sm">
              {s.fields.map(([label, value]) => (
                <div key={label} className="flex gap-3 px-3 py-2">
                  <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <Section title="Full request">
          <p className="break-all font-mono text-xs text-muted-foreground">
            {r.method} {r.path}
          </p>
          {query.length > 0 && (
            <dl className="rounded-md border p-3 font-mono text-xs">
              {query.map(([k, v], i) => (
                <div key={`${k}-${i}`} className="flex gap-2 py-0.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {showBody ? (
            <details open={small} className="group">
              <summary className="cursor-pointer select-none text-sm text-muted-foreground">Body (every field the agent sent)</summary>
              <div className="mt-2">
                <JsonTree value={r.body} openDepth={small ? 99 : 1} />
              </div>
            </details>
          ) : (
            <Notice>No body was sent.</Notice>
          )}
        </Section>

        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {decided ? (
          <div className="space-y-4">
            <p className="text-sm">
              {r.status === "approved" && "Done. The change was made."}
              {r.status === "failed" && `The change was allowed but did not go through${r.result?.status ? ` (error ${r.result.status})` : ""}.`}
              {r.status === "denied" && "Denied. Nothing was changed."}
            </p>
            <Notice>Tell the agent to check the request status.</Notice>
            <div className="flex justify-end">
              <Button type="button" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => decide("deny")}>
              Deny
            </Button>
            <Button type="button" variant={s.destructive ? "destructive" : "default"} disabled={busy} onClick={() => decide("allow")}>
              {busy ? "Working..." : s.destructive ? "Allow delete" : "Allow"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal title="Agent request" description="Review what the agent wants to change." isOpen onClose={close} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      {content}
    </Modal>
  );
};

"use client";

import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { normalizeDomain } from "@/lib/custom-domain";
import { cn } from "@/lib/utils";
import type { DnsRecord, DomainState, DomainStatus } from "@/lib/vercel-domains";

import { SettingRow, SettingsList, SettingsModal, useOpen } from "./setting-row";

type DomainData = { customDomain: string | null; status: DomainStatus | null };

async function call(url: string, init?: RequestInit): Promise<{ data: DomainData | null; error: string | null }> {
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

const STATE_BADGE: Record<DomainState, { label: string; className: string }> = {
  connected: { label: "Connected", className: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  pending_dns: { label: "Pending DNS", className: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  verification_required: { label: "Verification Required", className: "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  not_configured: { label: "Vercel Not Configured", className: "border-transparent bg-muted text-muted-foreground" },
  not_added: { label: "Not on Vercel", className: "border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  error: { label: "Status Unavailable", className: "border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

const StatusBadge = ({ state }: { state: DomainState }) => (
  <Badge variant="outline" className={cn("whitespace-nowrap", STATE_BADGE[state].className)}>
    {STATE_BADGE[state].label}
  </Badge>
);

const PROPAGATION_NOTE = "After you set the DNS record, it usually takes 1–3 minutes for DNS and the storefront to pick up the domain.";

// ---------------------------------------------------------------- DNS records

const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copied.`),
    () => toast.error("Could not copy. Select the text and copy it."),
  );

const CopyCell = ({ value, what }: { value: string; what: string }) => (
  <div className="flex min-w-0 items-center gap-1">
    <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs" title={value}>
      {value}
    </code>
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copy(value, what)} aria-label={`Copy ${what.toLowerCase()}`}>
      <Copy className="h-3.5 w-3.5" />
    </Button>
  </div>
);

const RecordsTable = ({ records }: { records: DnsRecord[] }) => (
  <div className="divide-y rounded-md border">
    <div className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.6fr)] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
      <span>Type</span>
      <span>Name</span>
      <span>Value</span>
    </div>
    {records.map((r) => (
      <div key={`${r.type}-${r.name}-${r.value}`} className="grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.6fr)] items-center gap-2 px-3 py-2 text-sm">
        <span className="font-mono text-xs font-semibold">{r.type}</span>
        <CopyCell value={r.name} what="Name" />
        <CopyCell value={r.value} what="Value" />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------- connect / change

const ConnectModal = ({ storeId, current, onClose, onSaved }: { storeId: string; current: string | null; onClose: () => void; onSaved: (data: DomainData) => void }) => {
  const [domain, setDomain] = useState(current ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const normalized = normalizeDomain(domain);

  const save = async () => {
    setError("");
    setLoading(true);
    const { data, error: err } = await call(`/api/${storeId}/domain`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    setLoading(false);
    if (err || !data) return setError(err ?? "Could not save the domain. Try again.");
    onSaved(data);
  };

  return (
    <SettingsModal
      title={current ? "Change custom domain" : "Connect a custom domain"}
      isOpen
      onClose={onClose}
      onSave={save}
      loading={loading}
      error={error}
      saveDisabled={!normalized || normalized === current}
    >
      <div className="grid gap-2">
        <Label htmlFor="custom-domain">Domain</Label>
        <Input
          id="custom-domain"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="shop.mybrand.com"
          value={domain}
          disabled={loading}
          onChange={(e) => setDomain(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          A domain you own. A subdomain (shop.mybrand.com) needs a CNAME record, the bare domain (mybrand.com) an A record. The next step shows
          the exact record.{current ? " The current domain stops working when you save." : ""}
        </p>
      </div>
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- manage

const ManageModal = ({
  storeId,
  data,
  onClose,
  onChange,
  onRefreshed,
  onDisconnected,
}: {
  storeId: string;
  data: DomainData & { customDomain: string };
  onClose: () => void;
  onChange: () => void;
  onRefreshed: (data: DomainData) => void;
  onDisconnected: () => void;
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [readding, setReadding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const status = data.status;
  const busy = refreshing || removing || readding;

  // "not_added": the domain is saved but missing on the Vercel project. Saving the same domain adds it again.
  const readd = async () => {
    setError("");
    setReadding(true);
    const { data: next, error: err } = await call(`/api/${storeId}/domain`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: data.customDomain }),
    });
    setReadding(false);
    if (err || !next) return setError(err ?? "Could not add the domain again. Try again.");
    onRefreshed(next);
    toast.success("Domain added again.");
  };

  const refresh = async () => {
    setError("");
    setRefreshing(true);
    const { data: next, error: err } = await call(`/api/${storeId}/domain?verify=1`);
    setRefreshing(false);
    if (err || !next) return setError(err ?? "Could not check the domain. Try again.");
    onRefreshed(next);
    if (next.status?.state === "connected") toast.success("Domain connected.");
  };

  const disconnect = async () => {
    setError("");
    setRemoving(true);
    const { error: err } = await call(`/api/${storeId}/domain`, { method: "DELETE" });
    setRemoving(false);
    if (err) {
      setConfirming(false);
      return setError(err);
    }
    toast.success("Domain disconnected.");
    onDisconnected();
  };

  if (confirming) {
    return (
      <Modal title="Disconnect this domain?" description="" isOpen onClose={() => !removing && setConfirming(false)} className="sm:max-w-lg">
        <div className="space-y-5">
          <p className="text-sm">
            <span className="font-medium">{data.customDomain}</span> stops showing your store within a few minutes. Your store URL keeps working. You
            can connect the domain again later.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={removing} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={removing} onClick={disconnect}>
              {removing ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Custom domain" description="" isOpen onClose={onClose} className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <a
              href={`https://${data.customDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 truncate font-medium hover:underline"
            >
              <span className="truncate">{data.customDomain}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            {status && <StatusBadge state={status.state} />}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={refresh}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Checking..." : "Verify / Refresh status"}
          </Button>
        </div>

        {status?.state === "connected" && <p className="text-sm text-muted-foreground">Your store is live on this domain. Keep the DNS record below in place.</p>}
        {status?.state === "not_configured" && (
          <p className="text-sm text-muted-foreground">
            The platform&apos;s Vercel connection is not set up, so the domain&apos;s status cannot be checked here. Set the record below; the domain
            works once it is also added to the storefront&apos;s Vercel project.
          </p>
        )}
        {status?.state === "not_added" && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={readd}>
            {readding ? "Adding..." : "Add the domain again"}
          </Button>
        )}
        {status?.error && <p className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{status.error}</p>}

        {status && status.verification.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Prove you own the domain</p>
            <p className="text-sm text-muted-foreground">The domain is in use on another Vercel account. Add this TXT record at your DNS provider, then click Verify.</p>
            <RecordsTable records={status.verification} />
          </div>
        )}

        {status && status.records.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{status.verification.length > 0 ? "2. Point the domain at the store" : "DNS record"}</p>
            <p className="text-sm text-muted-foreground">
              {status.apex
                ? `At your DNS provider, add an A record for ${status.apexName}.`
                : `At your DNS provider for ${status.apexName}, add a CNAME record.`}{" "}
              Remove other A, AAAA or CNAME records with the same name.
            </p>
            <RecordsTable records={status.records} />
          </div>
        )}

        <p className="text-xs text-muted-foreground">{PROPAGATION_NOTE}</p>

        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="destructive" disabled={busy} onClick={() => setConfirming(true)}>
            Disconnect
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onChange}>
              Change domain
            </Button>
            <Button type="button" disabled={busy} onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- the row

/** The store's own domain (shop.mybrand.com) as one settings row: connect, check DNS, change, disconnect. */
export const CustomDomainCard = ({ storeId, initialDomain }: { storeId: string; initialDomain: string | null }) => {
  const [data, setData] = useState<DomainData>({ customDomain: initialDomain, status: null });
  const [loading, setLoading] = useState(!!initialDomain);
  const [failed, setFailed] = useState(false);
  const connect = useOpen();
  const manage = useOpen();

  const load = useCallback(async () => {
    setFailed(false);
    setLoading(true);
    const { data: next, error } = await call(`/api/${storeId}/domain`);
    setLoading(false);
    if (error || !next) return setFailed(true);
    setData(next);
  }, [storeId]);

  useEffect(() => {
    if (!initialDomain) return;
    let cancelled = false;
    call(`/api/${storeId}/domain`).then(({ data: next, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error || !next) return setFailed(true);
      setData(next);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, initialDomain]);

  const domain = data.customDomain;
  const summary = domain ?? "Show your store on your own domain, for example shop.mybrand.com";

  return (
    <>
      <SettingsList>
        <SettingRow
          title="Custom domain"
          summary={summary}
          action={
            <div className="flex items-center gap-2">
              {domain && loading && <span className="text-xs text-muted-foreground">Checking...</span>}
              {domain && !loading && data.status && <StatusBadge state={data.status.state} />}
              {failed ? (
                <Button type="button" variant="outline" size="sm" onClick={load}>
                  Retry
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={domain ? manage.show : connect.show}>
                  {domain ? "Manage" : "Connect"}
                </Button>
              )}
            </div>
          }
        />
      </SettingsList>
      {connect.open && (
        <ConnectModal
          storeId={storeId}
          current={domain}
          onClose={connect.hide}
          onSaved={(next) => {
            connect.hide();
            setData(next);
            setFailed(false);
            toast.success("Domain saved. Now set the DNS record.");
            manage.show();
          }}
        />
      )}
      {manage.open && domain && (
        <ManageModal
          storeId={storeId}
          data={{ ...data, customDomain: domain }}
          onClose={manage.hide}
          onChange={() => {
            manage.hide();
            connect.show();
          }}
          onRefreshed={setData}
          onDisconnected={() => {
            manage.hide();
            setData({ customDomain: null, status: null });
          }}
        />
      )}
    </>
  );
};

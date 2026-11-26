import { after } from "next/server";

import { guessApexDomain, recordName } from "@/lib/custom-domain";

/**
 * The storefront's Vercel project and its domains (Vercel REST API), plus the storefront's Deploy Hook.
 *
 *   VERCEL_API_TOKEN              a Vercel access token that can manage the storefront project's domains
 *   VERCEL_STORE_PROJECT_ID       the storefront project's id (prj_...) or name
 *   VERCEL_TEAM_ID                optional: the team that owns the project (team_...)
 *   VERCEL_STORE_DEPLOY_HOOK_URL  optional: a Deploy Hook of the storefront project. Called after a domain change,
 *                                 so the storefront's build-time CUSTOM_DOMAINS map (scripts/generate-custom-domains.mjs)
 *                                 includes the new domain. Until that build is live the storefront asks the admin
 *                                 (GET /api/stores/by-domain), so a new domain works before the rebuild too.
 *
 * Without the token or project id nothing is sent: the status says vercelConfigured: false, and the domain is
 * still saved (local development, or a project whose domains are added by hand).
 */
const API = "https://api.vercel.com";
const TIMEOUT_MS = 8000;

/** Vercel's defaults for its edge network (used when the config endpoint does not recommend others). */
export const VERCEL_APEX_A_RECORD = "76.76.21.21";
export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

interface VercelConfig {
  token: string;
  projectId: string;
  teamId: string | null;
}

function vercelConfig(): VercelConfig | null {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const projectId = process.env.VERCEL_STORE_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID?.trim() || null };
}

export const isVercelConfigured = () => vercelConfig() !== null;

type VercelResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; message: string };

async function vercelFetch<T>(config: VercelConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<VercelResult<T>> {
  const url = new URL(`${API}${path}`);
  if (config.teamId) url.searchParams.set("teamId", config.teamId);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${config.token}`, ...(init.body !== undefined && { "Content-Type": "application/json" }) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
    if (res.ok) return { ok: true, status: res.status, data: data as T };
    return {
      ok: false,
      status: res.status,
      code: data?.error?.code ?? `http_${res.status}`,
      message: data?.error?.message ?? `Vercel answered ${res.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, code: "network_error", message: `Could not reach Vercel: ${message}` };
  }
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------- types

/** A Vercel project domain (GET /v9/projects/{id}/domains/{domain}). Only the fields used here. */
interface ProjectDomain {
  name: string;
  apexName?: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason?: string }[];
}

/** GET /v6/domains/{domain}/config. recommended* only on newer API versions. */
interface DomainConfig {
  misconfigured: boolean;
  configuredBy?: "CNAME" | "A" | "http" | "dns-01" | null;
  recommendedIPv4?: { rank: number; value: string[] }[];
  recommendedCNAME?: { rank: number; value: string }[];
}

export interface DnsRecord {
  type: "A" | "CNAME" | "TXT";
  /** The record's name in the owner's DNS zone: "@" = the apex, "shop" = shop.<apex>. */
  name: string;
  value: string;
  /** The fully qualified name, for providers that want it. */
  host: string;
}

export type DomainState =
  /** Vercel serves the domain: verified and DNS points at Vercel. */
  | "connected"
  /** Waiting for the A / CNAME record. */
  | "pending_dns"
  /** The domain is used by another Vercel account or project: a TXT record proves ownership. */
  | "verification_required"
  /** VERCEL_API_TOKEN / VERCEL_STORE_PROJECT_ID not set: nothing was checked. */
  | "not_configured"
  /** The domain is saved but not on the Vercel project (removed by hand?): saving it again re-adds it. */
  | "not_added"
  /** Vercel could not be asked. */
  | "error";

export interface DomainStatus {
  domain: string;
  state: DomainState;
  vercelConfigured: boolean;
  /** Vercel accepted the ownership of the domain. */
  verified: boolean;
  /** DNS does not point at Vercel yet. */
  misconfigured: boolean;
  /** Both: verified and not misconfigured. */
  configured: boolean;
  /** True for a registrable domain ("mybrand.com"): it needs an A record, a subdomain a CNAME. */
  apex: boolean;
  apexName: string;
  /** The record that sends the domain's traffic to Vercel (A for an apex, CNAME for a subdomain). */
  records: DnsRecord[];
  /** TXT records Vercel asks for before it accepts the domain (only with verification_required). */
  verification: DnsRecord[];
  error?: string;
}

// ---------------------------------------------------------------- records

function routingRecords(domain: string, apexName: string, config: DomainConfig | null): DnsRecord[] {
  const apex = domain === apexName;
  if (apex) {
    const ip = config?.recommendedIPv4?.slice().sort((a, b) => a.rank - b.rank)[0]?.value?.[0] ?? VERCEL_APEX_A_RECORD;
    return [{ type: "A", name: "@", value: ip, host: domain }];
  }
  const cname = config?.recommendedCNAME?.slice().sort((a, b) => a.rank - b.rank)[0]?.value?.replace(/\.$/, "") ?? VERCEL_CNAME_TARGET;
  return [{ type: "CNAME", name: recordName(domain, apexName), value: cname, host: domain }];
}

function verificationRecords(domain: ProjectDomain, apexName: string): DnsRecord[] {
  return (domain.verification ?? [])
    .filter((v) => v.type?.toUpperCase() === "TXT" && v.domain && v.value)
    .map((v) => ({ type: "TXT" as const, name: recordName(v.domain, apexName), value: v.value, host: v.domain }));
}

/** What the owner must set when Vercel cannot be asked: the default records for the domain. */
export function offlineStatus(domain: string, state: "not_configured" | "error", error?: string): DomainStatus {
  const apexName = guessApexDomain(domain);
  return {
    domain,
    state,
    vercelConfigured: state !== "not_configured",
    verified: false,
    misconfigured: true,
    configured: false,
    apex: domain === apexName,
    apexName,
    records: routingRecords(domain, apexName, null),
    verification: [],
    ...(error && { error }),
  };
}

// ---------------------------------------------------------------- operations

export type DomainMutation = { ok: true } | { ok: false; status: number; error: string };

/**
 * Adds the domain to the storefront project (POST /v10/projects/{id}/domains). Already on this project = fine.
 * Not configured = fine too (nothing to do).
 */
export async function addDomainToVercel(domain: string): Promise<DomainMutation> {
  const config = vercelConfig();
  if (!config) return { ok: true };
  const res = await vercelFetch<ProjectDomain>(config, `/v10/projects/${enc(config.projectId)}/domains`, { method: "POST", body: { name: domain } });
  if (res.ok) return { ok: true };

  // Already on this very project (a retry, or added by hand): it is ours. Checked for any failure, not only 409,
  // since the status Vercel gives for "already on this project" is not part of its documented contract.
  const existing = await vercelFetch<ProjectDomain>(config, `/v9/projects/${enc(config.projectId)}/domains/${enc(domain)}`);
  if (existing.ok) return { ok: true };
  if (res.status === 409) {
    return { ok: false, status: 409, error: "This domain is already connected to another Vercel project. Remove it there first." };
  }
  console.error(JSON.stringify({ event: "vercel_domain_add_failed", domain, status: res.status, code: res.code, message: res.message }));
  if (res.status === 400) return { ok: false, status: 400, error: `Vercel did not accept this domain: ${res.message}` };
  if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: "The platform's Vercel token cannot manage domains. Contact support." };
  return { ok: false, status: 502, error: "Could not add the domain on Vercel. Try again in a minute." };
}

/** Removes the domain from the storefront project (DELETE /v9/projects/{id}/domains/{domain}). 404 = already gone. */
export async function removeDomainFromVercel(domain: string): Promise<DomainMutation> {
  const config = vercelConfig();
  if (!config) return { ok: true };
  const res = await vercelFetch<unknown>(config, `/v9/projects/${enc(config.projectId)}/domains/${enc(domain)}`, { method: "DELETE" });
  if (res.ok || res.status === 404) return { ok: true };
  console.error(JSON.stringify({ event: "vercel_domain_remove_failed", domain, status: res.status, code: res.code, message: res.message }));
  return { ok: false, status: 502, error: "Could not remove the domain on Vercel. Try again in a minute." };
}

/** Best effort removal that never throws or delays the response (after a replaced domain or a deleted store). */
export function removeDomainFromVercelLater(domain: string) {
  const run = () => removeDomainFromVercel(domain).then(() => undefined);
  try {
    after(run);
  } catch {
    void run(); // outside a request scope
  }
}

/**
 * The live state of the domain: GET /v9/projects/{id}/domains/{domain} (verified, TXT challenges) and
 * GET /v6/domains/{domain}/config (does DNS point at Vercel). With `verify`, first asks Vercel to check the
 * TXT challenge again (POST .../verify), which is what the owner's "Verify" button means.
 */
export async function getDomainStatusFromVercel(domain: string, { verify = false } = {}): Promise<DomainStatus> {
  const config = vercelConfig();
  if (!config) return offlineStatus(domain, "not_configured");
  const base = `/v9/projects/${enc(config.projectId)}/domains/${enc(domain)}`;

  if (verify) await vercelFetch<ProjectDomain>(config, `${base}/verify`, { method: "POST" }); // its answer is read below

  const [project, dns] = await Promise.all([
    vercelFetch<ProjectDomain>(config, base),
    vercelFetch<DomainConfig>(config, `/v6/domains/${enc(domain)}/config`),
  ]);

  if (!project.ok) {
    if (project.status === 404) return { ...offlineStatus(domain, "error"), state: "not_added", error: "The domain is not on the storefront's Vercel project. Save it again to re-add it." };
    return offlineStatus(domain, "error", "Could not ask Vercel for the domain's status. Try again in a minute.");
  }

  const apexName = (project.data.apexName || guessApexDomain(domain)).toLowerCase();
  const verified = project.data.verified === true;
  const misconfigured = dns.ok ? dns.data.misconfigured !== false : true;
  const state: DomainState = !verified ? "verification_required" : misconfigured ? "pending_dns" : "connected";
  return {
    domain,
    state,
    vercelConfigured: true,
    verified,
    misconfigured,
    configured: verified && !misconfigured,
    apex: domain === apexName,
    apexName,
    records: routingRecords(domain, apexName, dns.ok ? dns.data : null),
    verification: verified ? [] : verificationRecords(project.data, apexName),
    ...(!dns.ok && { error: "Could not check the DNS records right now. Try again in a minute." }),
  };
}

// ---------------------------------------------------------------- deploy hook

/**
 * Rebuilds the storefront (POST to VERCEL_STORE_DEPLOY_HOOK_URL) so its build-time CUSTOM_DOMAINS map is current.
 * Never fails or delays the caller: runs after the response, logs failures. No hook set = nothing to do (the
 * storefront still finds new domains through GET /api/stores/by-domain).
 */
export function triggerStorefrontRedeploy(reason: string) {
  const hook = process.env.VERCEL_STORE_DEPLOY_HOOK_URL?.trim();
  if (!hook) return;
  const run = async () => {
    try {
      const res = await fetch(hook, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) console.error(JSON.stringify({ event: "store_deploy_hook_failed", reason, status: res.status }));
    } catch (error) {
      console.error(JSON.stringify({ event: "store_deploy_hook_failed", reason, error: error instanceof Error ? error.message : String(error) }));
    }
  };
  try {
    after(run);
  } catch {
    void run(); // outside a request scope
  }
}

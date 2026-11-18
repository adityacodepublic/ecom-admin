import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { createToken, hashToken } from "@/lib/agent/token";

/**
 * Everything about agent access lives in Store."agentAccess" (JSON). This file is the ONLY place that reads or
 * writes it. Pending requests (30 min from creation), decided requests (30 min from the decision) and log entries
 * (30 min) are dropped whenever the JSON is read or written;
 * the log keeps at most 50 entries. The link itself never expires.
 */

export const MAX_AGE_MS = 30 * 60 * 1000;
export const MAX_LOG = 50;
/** No count cap on pending requests (bulk imports). Only a size cap on the stored requests JSON. */
export const MAX_REQUESTS_BYTES = 2 * 1024 * 1024;
export const MAX_RESULT_CHARS = 10_000;

export type AgentMode = "full" | "permission";
export type RequestStatus = "pending" | "approved" | "denied" | "failed";

export type AgentRequest = {
  id: string;
  method: string;
  path: string; // e.g. "/products/abc"
  query: string; // without the "?", e.g. "page=1"
  body: unknown;
  status: RequestStatus;
  createdAt: string;
  decidedAt?: string;
  result?: { status: number; body: unknown };
};

export type AgentLogEntry = {
  at: string;
  method: string;
  path: string;
  status: number;
  outcome: "ok" | "error" | "blocked" | "pending";
};

export type AgentAccess = {
  link: { tokenHash: string; mode: AgentMode; createdAt: string } | null;
  requests: AgentRequest[];
  log: AgentLogEntry[];
};

const empty = (): AgentAccess => ({ link: null, requests: [], log: [] });

/** Defensive parse of whatever is in the column. */
function normalize(raw: unknown): AgentAccess {
  if (!raw || typeof raw !== "object") return empty();
  const r = raw as Partial<AgentAccess>;
  return {
    link: r.link && typeof r.link === "object" ? r.link : null,
    requests: Array.isArray(r.requests) ? r.requests : [],
    log: Array.isArray(r.log) ? r.log : [],
  };
}

/** A request that is being executed right now is kept (up to this long after the decision, in case the process died). */
export const MAX_EXECUTING_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: drops log entries older than 30 minutes and trims the log to the newest 50. A PENDING request lives 30
 * minutes from createdAt; a DECIDED one lives 30 minutes from decidedAt. An approved request without a result is
 * still executing and is never pruned mid-flight.
 */
export function prune(a: AgentAccess, now = Date.now()): AgentAccess {
  const fresh = (iso: string) => now - new Date(iso).getTime() <= MAX_AGE_MS;
  const keep = (r: AgentRequest) => {
    if (r.status === "pending" || !r.decidedAt) return fresh(r.createdAt);
    if (r.status === "approved" && r.result === undefined && now - new Date(r.decidedAt).getTime() <= MAX_EXECUTING_MS) return true;
    return fresh(r.decidedAt);
  };
  return {
    link: a.link,
    requests: a.requests.filter(keep),
    log: a.log.filter((l) => fresh(l.at)).slice(-MAX_LOG),
  };
}

/** Result bodies are stored truncated (~10KB). */
export function truncateResult(body: unknown): unknown {
  const text = JSON.stringify(body ?? null);
  if (text.length <= MAX_RESULT_CHARS) return body ?? null;
  return { truncated: true, preview: text.slice(0, MAX_RESULT_CHARS) };
}

const toDb = (a: AgentAccess) => (a.link ? (a as unknown as Prisma.InputJsonValue) : Prisma.DbNull);

/** Reads (and prunes) the access JSON. Persists the pruning if something was dropped. */
export async function readAccess(storeId: string): Promise<AgentAccess> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { agentAccess: true } });
  const raw = normalize(store?.agentAccess);
  const pruned = prune(raw);
  if (store && (pruned.requests.length !== raw.requests.length || pruned.log.length !== raw.log.length)) {
    await mutateAccess(storeId, () => undefined);
  }
  return pruned;
}

/**
 * Read-modify-write under a row lock, so two parallel calls cannot overwrite each other.
 * fn gets the pruned JSON and may change it in place; its return value is passed back.
 */
export async function mutateAccess<T>(storeId: string, fn: (a: AgentAccess) => T): Promise<T> {
  const run = () =>
    prismadb.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ agentAccess: unknown }[]>(
          Prisma.sql`SELECT "agentAccess" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`,
        );
        if (rows.length === 0) throw new Error("Store not found");
        const access = prune(normalize(rows[0].agentAccess));
        const out = fn(access);
        const next = prune(access);
        await tx.store.update({ where: { id: storeId }, data: { agentAccess: toDb(next) } });
        return out;
      },
      // Prisma's default is maxWait 2 s / timeout 5 s; other writers (order settings, contact) also lock this row.
      { maxWait: TX_WAIT_MS, timeout: TX_WAIT_MS },
    );
  try {
    return await run();
  } catch (error) {
    // One retry for a deadlock / write conflict (P2034) or a transaction that timed out or was closed (P2028).
    // Both roll the transaction back, so running fn again is safe.
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2028")) {
      return run();
    }
    throw error;
  }
}

const TX_WAIT_MS = 10_000;

/** Creates the link (replacing any existing one, with its requests and log). Returns the token: show it once. */
export async function createLink(storeId: string, mode: AgentMode): Promise<string> {
  const token = createToken();
  await mutateAccess(storeId, (a) => {
    a.link = { tokenHash: hashToken(token), mode, createdAt: new Date().toISOString() };
    a.requests = [];
    a.log = [];
  });
  return token;
}

/** Removes the link and everything else. Agent access is dead at once. */
export async function deleteLink(storeId: string): Promise<void> {
  await mutateAccess(storeId, (a) => {
    a.link = null;
    a.requests = [];
    a.log = [];
  });
}

/** The store (and its owner) a token belongs to, or null. */
export async function findByToken(
  token: string,
): Promise<{ storeId: string; userId: string; mode: AgentMode } | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  // Raw SQL on purpose: this exact expression is what the "Store_agentTokenHash_idx" index (sql/agent-access.sql)
  // is built on. Prisma's JSON path filter generates a different operator (#>) that cannot use it.
  const rows = await prismadb.$queryRaw<{ id: string; userId: string; agentAccess: unknown }[]>(
    Prisma.sql`SELECT "id", "userId", "agentAccess" FROM "Store"
               WHERE ("agentAccess"->'link'->>'tokenHash') = ${hashToken(token)} LIMIT 1`,
  );
  const store = rows[0];
  if (!store) return null;
  const link = normalize(store.agentAccess).link;
  if (!link) return null;
  return { storeId: store.id, userId: store.userId, mode: link.mode === "permission" ? "permission" : "full" };
}

/** Best effort: a log failure must never fail the agent call (it is swallowed here). */
export async function appendLog(storeId: string, entry: Omit<AgentLogEntry, "at">): Promise<void> {
  try {
    await mutateAccess(storeId, (a) => {
      if (a.link) a.log.push({ at: new Date().toISOString(), ...entry });
    });
  } catch (error) {
    console.log("[AGENT_LOG]", error);
  }
}

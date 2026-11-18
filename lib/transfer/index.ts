import crypto from "crypto";
import { Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { createToken, hashToken } from "@/lib/agent/token";

/**
 * Handing ONE store to another account. Everything lives in Store."transfer" (JSON): the hashed token, the
 * recipient's email and when it was made. The owner shares a link `/transfer/<storeId>/<token>`; the recipient
 * signs in (with that email), accepts, and Store.userId is swapped. Only this one store moves.
 */

export const TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Transfer = { tokenHash: string; email: string; createdAt: string };

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

/** "john.doe@gmail.com" -> "j***@gmail.com" (shown to a signed-in stranger who opened the link). */
export const maskEmail = (e: string) => {
  const [name, domain] = e.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
};

function parse(raw: unknown): Transfer | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<Transfer>;
  if (typeof t.tokenHash !== "string" || typeof t.email !== "string" || typeof t.createdAt !== "string") return null;
  return { tokenHash: t.tokenHash, email: t.email, createdAt: t.createdAt };
}

const isExpired = (t: Transfer, now = Date.now()) => now - new Date(t.createdAt).getTime() > TRANSFER_TTL_MS;

const sameHash = (a: string, b: string) => {
  const x = new Uint8Array(Buffer.from(a));
  const y = new Uint8Array(Buffer.from(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** The owner's view: is a transfer pending, and to whom. Never returns the token. */
export async function readPending(storeId: string): Promise<{ email: string; createdAt: string; expired: boolean } | null> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { transfer: true } });
  const t = parse(store?.transfer);
  return t ? { email: t.email, createdAt: t.createdAt, expired: isExpired(t) } : null;
}

/** Starts (or replaces) the hand-over. Returns the token: shown once, only its hash is stored. */
export async function createTransfer(storeId: string, email: string): Promise<string> {
  const token = createToken();
  const transfer: Transfer = { tokenHash: hashToken(token), email: normalizeEmail(email), createdAt: new Date().toISOString() };
  await prismadb.store.update({ where: { id: storeId }, data: { transfer: transfer as unknown as Prisma.InputJsonValue } });
  return token;
}

export async function cancelTransfer(storeId: string): Promise<void> {
  await prismadb.store.update({ where: { id: storeId }, data: { transfer: Prisma.DbNull } });
}

export type Preview =
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "ok"; storeName: string; email: string };

/** What the recipient's page shows. Same "invalid" answer for a missing store, no transfer, or a wrong token. */
export async function previewTransfer(storeId: string, token: string): Promise<Preview> {
  const store = await prismadb.store.findUnique({ where: { id: storeId }, select: { name: true, transfer: true } });
  const t = parse(store?.transfer);
  if (!store || !t || !sameHash(t.tokenHash, hashToken(token))) return { status: "invalid" };
  if (isExpired(t)) return { status: "expired" };
  return { status: "ok", storeName: store.name, email: t.email };
}

export type AcceptResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "wrong_account" | "already_owner" };

/**
 * The swap, under a row lock: checks the token and that the signed-in user has the invited email VERIFIED,
 * then makes them the owner. The transfer is cleared and the agent link (with its requests and log) is
 * removed, because the new owner must not inherit the old owner's agent access.
 */
export async function acceptTransfer(storeId: string, token: string, newUserId: string, verifiedEmails: string[]): Promise<AcceptResult> {
  return prismadb.$transaction(
    async (tx): Promise<AcceptResult> => {
      const rows = await tx.$queryRaw<{ userId: string; transfer: unknown }[]>(
        Prisma.sql`SELECT "userId", "transfer" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`,
      );
      const t = rows.length ? parse(rows[0].transfer) : null;
      if (!t || !sameHash(t.tokenHash, hashToken(token))) return { ok: false, reason: "invalid" };
      if (isExpired(t)) return { ok: false, reason: "expired" };
      if (rows[0].userId === newUserId) return { ok: false, reason: "already_owner" };
      if (!verifiedEmails.map(normalizeEmail).includes(t.email)) return { ok: false, reason: "wrong_account" };
      await tx.store.update({
        where: { id: storeId },
        data: { userId: newUserId, transfer: Prisma.DbNull, agentAccess: Prisma.DbNull },
      });
      return { ok: true };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

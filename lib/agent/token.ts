import crypto from "crypto";

/** 32 random bytes, base64url (43 chars). Shown once; only the hash is stored. */
export function createToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 12-char url-safe id for a request. */
export function newRequestId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

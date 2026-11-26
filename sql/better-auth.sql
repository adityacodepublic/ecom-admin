-- Better Auth (the STOREFRONT's shopper sign-in; next13-ecommerce-store/lib/auth.ts): its four tables.
-- Run once on Neon BEFORE deploying the storefront code. Safe to run twice (nothing is dropped or changed).
-- Layout = what Better Auth 1.7 itself creates for the Email OTP + OAuth proxy setup, with the model names set to
-- ba_user / ba_session / ba_account / ba_verification (so they never collide with the shoppers' "Users" table).
-- Better Auth keeps its camelCase column names, hence the quotes. prisma/schema.prisma (BaUser, BaSession, BaAccount,
-- BaVerification) describes the same tables: no drift (checked with prisma migrate diff). No database foreign keys on
-- "userId", like every other table here (relationMode = "prisma": Prisma enforces the relations, and a real FK would
-- show up as drift); Better Auth deletes a user's sessions and accounts itself. The storefront checks this layout at runtime and fails its
-- auth requests with a clear error if it ever differs.
-- Rollback: DROP TABLE IF EXISTS "ba_verification", "ba_account", "ba_session", "ba_user";

CREATE TABLE IF NOT EXISTS "ba_user" (
  "id"            TEXT        NOT NULL PRIMARY KEY,
  "name"          TEXT        NOT NULL,
  "email"         TEXT        NOT NULL UNIQUE,
  "emailVerified" BOOLEAN     NOT NULL,
  "image"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ba_session" (
  "id"        TEXT        NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token"     TEXT        NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT        NOT NULL
);
CREATE INDEX IF NOT EXISTS "ba_session_userId_idx" ON "ba_session" ("userId");

CREATE TABLE IF NOT EXISTS "ba_account" (
  "id"                    TEXT        NOT NULL PRIMARY KEY,
  "accountId"             TEXT        NOT NULL,
  "providerId"            TEXT        NOT NULL,
  "userId"                TEXT        NOT NULL,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "ba_account_userId_idx" ON "ba_account" ("userId");

CREATE TABLE IF NOT EXISTS "ba_verification" (
  "id"         TEXT        NOT NULL PRIMARY KEY,
  "identifier" TEXT        NOT NULL,
  "value"      TEXT        NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ba_verification_identifier_idx" ON "ba_verification" ("identifier");

-- Agent access: one JSON column on Store holds the agent link (hashed token + mode), pending requests and a short log.
-- Run once on Neon BEFORE deploying the matching code. Safe to run twice.
-- Rollback: DROP INDEX IF EXISTS "Store_agentTokenHash_idx"; ALTER TABLE "Store" DROP COLUMN "agentAccess";
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "agentAccess" JSONB;

-- Token lookup (lib/agent/store.ts findByToken): every agent call finds its store by this expression.
CREATE INDEX IF NOT EXISTS "Store_agentTokenHash_idx" ON "Store" ((("agentAccess"->'link'->>'tokenHash')));

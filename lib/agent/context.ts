import { AsyncLocalStorage } from "async_hooks";
import { auth } from "@clerk/nextjs/server";

/**
 * When the agent proxy runs an admin route in-process, it sets this context. getUserId() then answers with the
 * store owner's id instead of reading the Clerk session. Normal browser calls have no context and use Clerk.
 */
export const agentContext = new AsyncLocalStorage<{ userId: string; storeId: string }>();

export async function getUserId(): Promise<string | null> {
  const ctx = agentContext.getStore();
  if (ctx) return ctx.userId;
  const { userId } = await auth();
  return userId ?? null;
}

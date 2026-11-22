import { z } from "zod";

import { requireStoreOwner } from "@/lib/api/admin-auth";
import { errorResponse, json } from "@/lib/api/http";
import { listBuyers, listDelivered, listReasonOrders } from "@/lib/orders/analytics";
import { OrderError } from "@/lib/orders/errors";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Admin: the rows behind a dashboard card, read when its dialog opens (the page itself sends only the counts).
 *   buyers?group=new|repeat                          a group of buyers, biggest spenders first
 *   reasons?kind=cancel|return&reason=...&from=DAY   the orders that gave a cancel / return reason
 *   delivery?from=DAY                                the delivered orders with how long each took
 * `from` = the first day of the dashboard's range (YYYY-MM-DD, India time).
 */
const queries = {
  buyers: z.object({ group: z.enum(["new", "repeat"]) }),
  reasons: z.object({ kind: z.enum(["cancel", "return"]), reason: z.string().min(1).max(600), from: day }),
  delivery: z.object({ from: day }),
};

export async function GET(req: Request, { params }: { params: Promise<{ storeId: string; list: string }> }) {
  try {
    const { storeId, list } = await params;
    await requireStoreOwner(storeId);
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    if (list === "buyers") return json({ buyers: await listBuyers(storeId, parse(queries.buyers, sp).group) });
    if (list === "reasons") {
      const q = parse(queries.reasons, sp);
      return json(await listReasonOrders(storeId, q.kind, q.reason, q.from));
    }
    if (list === "delivery") return json(await listDelivered(storeId, parse(queries.delivery, sp).from));
    throw new OrderError("NOT_FOUND", "No such list");
  } catch (error) {
    return errorResponse(error, "INSIGHTS_LIST_GET");
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new OrderError("VALIDATION", "Invalid query", r.error.flatten());
  return r.data;
}

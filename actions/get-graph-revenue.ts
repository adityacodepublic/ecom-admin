import { revenueByMonth } from "@/lib/orders/queries";

interface GraphData {
  name: string;
  total: number; // rupees, for the chart only
}

/** Paid revenue per month of this year (India time), from the frozen order totals. */
export const getGraphRevenue = async (storeId: string): Promise<GraphData[]> => {
  const months = await revenueByMonth(storeId);
  // Display only: whole paise / 100 is fine for a chart axis.
  return months.map((m) => ({ name: m.month, total: m.revenuePaise / 100 }));
};

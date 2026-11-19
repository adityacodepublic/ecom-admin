import prismadb from "@/lib/prismadb";

/** True when the id belongs to a category of this store. */
export async function categoryInStore(storeId: string, id: unknown): Promise<boolean> {
  if (typeof id !== "string" || !id) return false;
  return !!(await prismadb.category.findFirst({ where: { id, storeId }, select: { id: true } }));
}

/** True when every valueId is a Value whose Filter belongs to this store. */
export async function valuesInStore(storeId: string, valueIds: unknown[]): Promise<boolean> {
  if (valueIds.some((v) => typeof v !== "string" || !v)) return false;
  const unique = Array.from(new Set(valueIds as string[]));
  if (unique.length === 0) return true;
  const count = await prismadb.value.count({ where: { id: { in: unique }, filter: { storeId } } });
  return count === unique.length;
}

/** Stock: a whole number, 0 or more. */
export const isStockQuantity = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** Max per order: a whole number, 1 or more. */
export const isMaxQuantity = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 1;

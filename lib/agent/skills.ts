import fs from "fs/promises";
import path from "path";

import prismadb from "@/lib/prismadb";
import { storeUrl } from "@/lib/store-url";

/** Skill markdown from agent-skills/{name}.md ("index" = the router). {{BASE}} becomes the real base URL and
 * {{STORE_URL}} the store's public storefront address. */
export async function readSkill(name: string, base: string, storeId: string): Promise<string | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(name)) return null;
  try {
    const text = await fs.readFile(path.join(process.cwd(), "agent-skills", `${name}.md`), "utf8");
    let out = text.split("{{BASE}}").join(base);
    if (out.includes("{{STORE_URL}}")) {
      const store = await prismadb.store.findFirst({ where: { id: storeId }, select: { slug: true } });
      out = out.split("{{STORE_URL}}").join(store?.slug ? storeUrl(store.slug) : "(storefront address not available)");
    }
    return out;
  } catch {
    return null;
  }
}

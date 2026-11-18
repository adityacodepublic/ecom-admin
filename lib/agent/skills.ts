import fs from "fs/promises";
import path from "path";

/** Skill markdown from agent-skills/{name}.md ("index" = the router). {{BASE}} becomes the real base URL. */
export async function readSkill(name: string, base: string): Promise<string | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(name)) return null;
  try {
    const text = await fs.readFile(path.join(process.cwd(), "agent-skills", `${name}.md`), "utf8");
    return text.split("{{BASE}}").join(base);
  } catch {
    return null;
  }
}

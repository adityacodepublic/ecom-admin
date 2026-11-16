/**
 * One-time: moves the Cloudinary images that were uploaded WITHOUT a folder into ecom/<storeId>/,
 * for the store that uses them. Copy first, so nothing breaks while it runs:
 *
 *   1. (default) DRY RUN  : only reads the database. Lists every old image, who uses it, the new
 *                           public id, and writes mapping.json + migrate.sql. Writes nothing else.
 *   2. --copy             : uploads a copy of each old file to its new public id (overwrite:false,
 *                           skips copies that already exist). No database change. Old files untouched.
 *   3. --apply-db         : ONE transaction that rewrites every reference (Image.url, billboardImage.url,
 *                           Category.imageUrl, Product.description, MediaImage url + publicId) per store.
 *                           It first checks that every new url answers 200 (skip with --no-check).
 *   4. --verify           : every new url answers 200 and no old url is left in the database.
 *   5. --delete-old --yes : destroys the old files, only if verify passes and NOTHING in the database
 *                           (any store) still points at the old url or public id.
 *
 *   DATABASE_URL=<url> npx tsx scripts/migrate-cloudinary-to-store-folders.ts --out <folder> [mode]
 *
 * It uses DATABASE_URL from the environment (Prisma reads .env = Neon, NOT .env.local), and prints the
 * database host first. CLOUDINARY_URL is read from the environment or from .env.local / .env (never printed).
 * --out is the folder for mapping.json and migrate.sql (default ./migration-output).
 *
 * migrate.sql has the same UPDATEs as plain SQL (for a database this PC cannot reach). The old files
 * are removed only by --delete-old, in the database you point it at: run it last, when every database
 * that uses these images has been updated.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

import { destroyImage, signParams } from "../lib/cloudinary";
import { parsePublicId } from "../lib/media";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const outIndex = args.indexOf("--out");
const outDir = path.resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : "migration-output");
const mappingFile = path.join(outDir, "mapping.json");
const sqlFile = path.join(outDir, "migrate.sql");

const MODES = ["--copy", "--apply-db", "--verify", "--delete-old"].filter(has);
const CLOUD_URL_RE = /https:\/\/res\.cloudinary\.com\/[^\s)"'<>\]]+/g;

type Use = { type: "product image" | "billboard image" | "category" | "description" | "library"; label: string };
type Entry = {
  storeId: string;
  storeName: string;
  oldUrl: string;
  oldPublicId: string;
  newPublicId: string;
  newUrl: string;
  usedIn: Use[];
};
type Mapping = { generatedAt: string; dbHost: string; cloudName: string; entries: Entry[]; skipped: { storeId: string; url: string; reason: string }[] };

function loadCloudinaryEnv() {
  if (process.env.CLOUDINARY_URL) return;
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith("CLOUDINARY_URL="));
    if (line) {
      process.env.CLOUDINARY_URL = line.slice("CLOUDINARY_URL=".length).trim().replace(/^["']|["']$/g, "");
      return;
    }
  }
}

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Cloud name, public id and extension of one of our own delivery urls, or a reason it cannot be moved. */
function parseOld(url: string): { cloud: string; publicId: string; ext: string } | string {
  const cloud = url.match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\//)?.[1];
  if (!cloud) return "not an image/upload url";
  const publicId = parsePublicId(url);
  if (!publicId) return "resized or transformed link: public id cannot be read for sure";
  const ext = url.match(/\.([A-Za-z0-9]+)$/)?.[1];
  if (!ext) return "no file extension";
  return { cloud, publicId, ext };
}

// ---------- scan the database ----------
async function scan(): Promise<Mapping> {
  const dbHost = new URL(process.env.DATABASE_URL ?? "").host;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const entries: Entry[] = [];
  const skipped: Mapping["skipped"] = [];
  let cloudName = "";

  for (const store of stores) {
    const uses = new Map<string, Use[]>(); // url -> where used
    const add = (url: string, use: Use) => {
      if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) return;
      if (!uses.has(url)) uses.set(url, []);
      uses.get(url)!.push(use);
    };

    for (const i of await prisma.image.findMany({ where: { product: { storeId: store.id } }, select: { url: true, product: { select: { name: true } } } }))
      add(i.url, { type: "product image", label: i.product?.name ?? "?" });
    for (const i of await prisma.billboardImage.findMany({ where: { billboard: { storeId: store.id } }, select: { url: true, billboard: { select: { label: true } } } }))
      add(i.url, { type: "billboard image", label: i.billboard?.label ?? "?" });
    for (const c of await prisma.category.findMany({ where: { storeId: store.id }, select: { imageUrl: true, name: true } }))
      add(c.imageUrl, { type: "category", label: c.name });
    for (const p of await prisma.product.findMany({ where: { storeId: store.id, description: { not: null } }, select: { name: true, description: true } }))
      for (const u of Array.from(new Set(p.description!.match(CLOUD_URL_RE) ?? []))) add(u, { type: "description", label: p.name });
    for (const m of await prisma.mediaImage.findMany({ where: { storeId: store.id }, select: { url: true, name: true } }))
      add(m.url, { type: "library", label: m.name });

    const takenNew = new Set<string>();
    for (const [url, usedIn] of Array.from(uses)) {
      const p = parseOld(url);
      if (typeof p === "string") {
        skipped.push({ storeId: store.id, url, reason: p });
        continue;
      }
      if (p.publicId.startsWith(`ecom/${store.id}/`)) continue; // already in this store's folder
      cloudName = cloudName || p.cloud;
      const base = p.publicId.split("/").pop()!;
      let newPublicId = `ecom/${store.id}/${base}`;
      for (let n = 2; takenNew.has(newPublicId); n++) newPublicId = `ecom/${store.id}/${base}-${n}`;
      takenNew.add(newPublicId);
      entries.push({
        storeId: store.id,
        storeName: store.name,
        oldUrl: url,
        oldPublicId: p.publicId,
        newPublicId,
        newUrl: `https://res.cloudinary.com/${p.cloud}/image/upload/${newPublicId}.${p.ext}`,
        usedIn,
      });
    }
  }
  return { generatedAt: new Date().toISOString(), dbHost, cloudName, entries, skipped };
}

function sqlFor(e: Entry): string[] {
  const o = sq(e.oldUrl), n = sq(e.newUrl), s = sq(e.storeId);
  return [
    `UPDATE "Image" SET "url" = ${n} WHERE "url" = ${o} AND "productId" IN (SELECT "id" FROM "Product" WHERE "storeId" = ${s});`,
    `UPDATE "billboardImage" SET "url" = ${n} WHERE "url" = ${o} AND "billboardId" IN (SELECT "id" FROM "Billboard" WHERE "storeId" = ${s});`,
    `UPDATE "Category" SET "imageUrl" = ${n} WHERE "imageUrl" = ${o} AND "storeId" = ${s};`,
    `UPDATE "Product" SET "description" = replace("description", ${o}, ${n}) WHERE "storeId" = ${s} AND position(${o} in "description") > 0;`,
    `UPDATE "MediaImage" SET "url" = ${n}, "publicId" = ${sq(e.newPublicId)} WHERE "url" = ${o} AND "storeId" = ${s};`,
  ];
}

function writeOutputs(m: Mapping) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(mappingFile, JSON.stringify(m, null, 2));
  const sql = [
    "-- Moves old Cloudinary urls to the per-store folder urls. Run ONLY after the copies exist (--copy).",
    `-- Generated ${m.generatedAt} from database ${m.dbHost}. Safe to run twice (a second run changes nothing).`,
    "BEGIN;",
    ...m.entries.flatMap(sqlFor),
    "COMMIT;",
    "",
  ].join("\n");
  fs.writeFileSync(sqlFile, sql);
}

function readMapping(): Mapping {
  if (!fs.existsSync(mappingFile)) throw new Error(`No ${mappingFile}. Run the dry run first (no mode flag).`);
  return JSON.parse(fs.readFileSync(mappingFile, "utf8"));
}

async function head(url: string): Promise<number> {
  try {
    return (await fetch(url, { method: "HEAD" })).status;
  } catch {
    return 0;
  }
}

// ---------- modes ----------
function dryRun(m: Mapping) {
  const stores = new Set(m.entries.map((e) => e.storeId));
  const byOld = new Map<string, Entry[]>();
  m.entries.forEach((e) => byOld.set(e.oldUrl, [...(byOld.get(e.oldUrl) ?? []), e]));
  for (const e of m.entries) {
    const count = (t: Use["type"]) => e.usedIn.filter((u) => u.type === t).length;
    console.log(
      `store "${e.storeName}" (${e.storeId.slice(0, 8)})  ${e.oldPublicId}  ->  ${e.newPublicId}\n` +
        `    ${e.oldUrl}\n` +
        `    used in: products ${count("product image")}, billboards ${count("billboard image")}, categories ${count("category")}, descriptions ${count("description")}, library ${count("library")}`,
    );
  }
  const shared = Array.from(byOld).filter(([, v]) => v.length > 1);
  console.log("\n===== SUMMARY =====");
  console.log(`Database: ${m.dbHost}`);
  console.log(`Old images to move: ${byOld.size} distinct files, ${m.entries.length} copies (one per store), ${stores.size} store(s)`);
  console.log(`Used by more than one store (copied once per store): ${shared.length}`);
  shared.forEach(([url, v]) => console.log(`   ${url} -> ${v.map((x) => x.storeId.slice(0, 8)).join(", ")}`));
  console.log(`Skipped (cannot move safely): ${m.skipped.length}`);
  m.skipped.forEach((s) => console.log(`   ${s.reason}: ${s.url}`));
  console.log(`Wrote ${mappingFile}\nWrote ${sqlFile}\nNothing else was written. Next: --copy`);
}

async function copy(m: Mapping) {
  loadCloudinaryEnv();
  const done = new Set<string>();
  let copied = 0, existed = 0, failed = 0;
  for (const e of m.entries) {
    if (done.has(e.newPublicId)) continue;
    done.add(e.newPublicId);
    if ((await head(e.newUrl)) === 200) {
      existed++;
      continue;
    }
    const timestamp = Math.round(Date.now() / 1000);
    const s = signParams({ overwrite: "false", public_id: e.newPublicId, timestamp });
    const body = new FormData();
    body.append("file", e.oldUrl);
    body.append("public_id", e.newPublicId);
    body.append("overwrite", "false");
    body.append("timestamp", String(timestamp));
    body.append("api_key", s.apiKey);
    body.append("signature", s.signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`, { method: "POST", body });
    if (res.ok) {
      copied++;
      console.log(`copied  ${e.newPublicId}`);
    } else {
      failed++;
      console.log(`FAILED  ${e.newPublicId}: ${(await res.text()).slice(0, 200)}`);
    }
  }
  console.log(`Copy done: ${copied} copied, ${existed} already there, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

async function checkNewUrls(m: Mapping): Promise<number> {
  let bad = 0;
  const seen = new Set<string>();
  for (const e of m.entries) {
    if (seen.has(e.newUrl)) continue;
    seen.add(e.newUrl);
    const st = await head(e.newUrl);
    if (st !== 200) {
      bad++;
      console.log(`NOT 200 (${st}): ${e.newUrl}`);
    }
  }
  return bad;
}

async function applyDb(m: Mapping) {
  if (!has("--no-check")) {
    const bad = await checkNewUrls(m);
    if (bad) throw new Error(`${bad} new url(s) do not answer 200. Run --copy first (or --no-check if you know better). Database not changed.`);
    console.log("All new urls answer 200.");
  }
  const counts = { Image: 0, billboardImage: 0, Category: 0, Product: 0, MediaImage: 0 };
  await prisma.$transaction(async (tx) => {
    for (const e of m.entries) {
      counts.Image += await tx.$executeRaw`UPDATE "Image" SET "url" = ${e.newUrl} WHERE "url" = ${e.oldUrl} AND "productId" IN (SELECT "id" FROM "Product" WHERE "storeId" = ${e.storeId})`;
      counts.billboardImage += await tx.$executeRaw`UPDATE "billboardImage" SET "url" = ${e.newUrl} WHERE "url" = ${e.oldUrl} AND "billboardId" IN (SELECT "id" FROM "Billboard" WHERE "storeId" = ${e.storeId})`;
      counts.Category += await tx.$executeRaw`UPDATE "Category" SET "imageUrl" = ${e.newUrl} WHERE "imageUrl" = ${e.oldUrl} AND "storeId" = ${e.storeId}`;
      counts.Product += await tx.$executeRaw`UPDATE "Product" SET "description" = replace("description", ${e.oldUrl}, ${e.newUrl}) WHERE "storeId" = ${e.storeId} AND position(${e.oldUrl} in "description") > 0`;
      counts.MediaImage += await tx.$executeRaw`UPDATE "MediaImage" SET "url" = ${e.newUrl}, "publicId" = ${e.newPublicId} WHERE "url" = ${e.oldUrl} AND "storeId" = ${e.storeId}`;
    }
  }, { timeout: 120000 });
  console.log("Database updated (one transaction). Rows changed:", counts);
}

/** Old urls still in the database (any store). Returns a list of problems. */
async function oldStillInDb(m: Mapping): Promise<string[]> {
  const left: string[] = [];
  for (const o of Array.from(new Set(m.entries.map((e) => e.oldUrl)))) {
    const pid = m.entries.find((e) => e.oldUrl === o)!.oldPublicId;
    const hits = [
      await prisma.image.count({ where: { url: o } }) && "Image",
      await prisma.billboardImage.count({ where: { url: o } }) && "billboardImage",
      await prisma.category.count({ where: { imageUrl: o } }) && "Category",
      (await prisma.product.count({ where: { OR: [{ description: { contains: o } }, { description: { contains: pid } }] } })) && "Product.description",
      (await prisma.mediaImage.count({ where: { OR: [{ url: o }, { publicId: pid }] } })) && "MediaImage",
    ].filter(Boolean);
    if (hits.length) left.push(`${o}  still in: ${hits.join(", ")}`);
  }
  return left;
}

async function verify(m: Mapping): Promise<boolean> {
  const bad = await checkNewUrls(m);
  const left = await oldStillInDb(m);
  left.forEach((l) => console.log(`OLD URL LEFT: ${l}`));
  const ok = bad === 0 && left.length === 0;
  console.log(ok ? "VERIFY OK: every new url answers 200 and no old url is left in the database." : `VERIFY FAILED: ${bad} bad new url(s), ${left.length} old url(s) left.`);
  return ok;
}

async function deleteOld(m: Mapping) {
  if (!has("--yes")) throw new Error("--delete-old needs --yes. It permanently deletes the old Cloudinary files.");
  loadCloudinaryEnv();
  if (!(await verify(m))) throw new Error("Verify did not pass. Nothing deleted.");
  let deleted = 0, gone = 0;
  for (const pid of Array.from(new Set(m.entries.map((e) => e.oldPublicId)))) {
    // Same rule as the library delete, but for ANY reference in this database: url or public id.
    const url = m.entries.find((e) => e.oldPublicId === pid)!.oldUrl;
    const refs = (await prisma.mediaImage.count({ where: { OR: [{ url }, { publicId: pid }] } })) +
      (await prisma.image.count({ where: { url } })) + (await prisma.billboardImage.count({ where: { url } })) +
      (await prisma.category.count({ where: { imageUrl: url } })) +
      (await prisma.product.count({ where: { OR: [{ description: { contains: url } }, { description: { contains: pid } }] } }));
    if (refs) {
      console.log(`KEPT (still referenced): ${pid}`);
      continue;
    }
    const r = await destroyImage(pid);
    r === "ok" ? deleted++ : gone++;
    console.log(`${r === "ok" ? "deleted" : "already gone"}  ${pid}`);
  }
  console.log(`Old files: ${deleted} deleted, ${gone} already gone.`);
}

async function main() {
  console.log(`Database host: ${new URL(process.env.DATABASE_URL ?? "").host}`);
  if (MODES.length > 1) throw new Error(`Use one mode at a time (got ${MODES.join(" ")}).`);
  const mode = MODES[0] ?? "dry-run";
  console.log(`MODE: ${mode}`);

  if (mode === "dry-run") {
    const m = await scan();
    writeOutputs(m);
    dryRun(m);
    return;
  }
  const m = readMapping();
  console.log(`Using ${mappingFile} (made ${m.generatedAt} from ${m.dbHost}, ${m.entries.length} entries)`);
  if (mode === "--copy") await copy(m);
  else if (mode === "--apply-db") await applyDb(m);
  else if (mode === "--verify") process.exitCode = (await verify(m)) ? 0 : 1;
  else if (mode === "--delete-old") await deleteOld(m);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

// Checks that the files shared by the admin and the store are the same in both repos.
// lib/home-layout.ts (page layouts, blocks and the Markdown style spec) is copied by hand between the repos.
// Runs from the git pre-push hook of both repos. Run by hand: node scripts/check-shared.mjs
// Needs both repos side by side: <folder>/next13-ecommerce-admin and <folder>/next13-ecommerce-store.
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SHARED = ["lib/home-layout.ts"];
const admin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = path.resolve(admin, "..", "next13-ecommerce-store");

if (!existsSync(store)) {
  console.warn(`check-shared: the store repo is not at ${store}. Skipped.`);
  process.exit(0);
}
const read = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const different = SHARED.filter((f) => read(path.join(admin, f)) !== read(path.join(store, f)));
if (different.length) {
  console.error(`check-shared: these files differ between the admin and the store: ${different.join(", ")}`);
  console.error("Copy the newer one over the other, then push again.");
  process.exit(1);
}
console.log(`check-shared: ${SHARED.join(", ")} match.`);

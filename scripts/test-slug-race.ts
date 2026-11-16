/**
 * Proves the unique index decides slug races: parallel creates and renames that want the SAME slug,
 * and exactly one wins (the others get 409 "This URL name is already taken").
 * Local database only. It creates test stores under a fake user id and deletes them at the end.
 *
 *   DATABASE_URL=<local db> npx tsx scripts/test-slug-race.ts
 */
import prismadb from "@/lib/prismadb";
import { changeStoreSlug, createStore } from "@/lib/store-slug";

const USER = "slug-race-test-user";

async function round(label: string, attempts: Promise<{ ok: boolean; status?: number }>[]) {
  const results = await Promise.all(attempts);
  const wins = results.filter((r) => r.ok).length;
  const conflicts = results.filter((r) => !r.ok && r.status === 409).length;
  const pass = wins === 1 && conflicts === results.length - 1;
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: ${wins} won, ${conflicts} got 409, of ${results.length}`);
  return pass;
}

async function main() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Local database only");
  await prismadb.store.deleteMany({ where: { userId: USER } });

  const ok: boolean[] = [];
  ok.push(await round("8 parallel creates of race-create", Array.from({ length: 8 }, (_, i) => createStore(`Race ${i}`, USER, "race-create"))));

  const stores = await Promise.all([1, 2, 3, 4].map(async (i) => {
    const r = await createStore(`Rename ${i}`, USER, `race-start-${i}`);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }));
  ok.push(
    await round("4 parallel renames + 2 creates to race-target", [
      ...stores.map((s) => changeStoreSlug(s.id, USER, "race-target")),
      createStore("Race create A", USER, "race-target"),
      createStore("Race create B", USER, "race-target"),
    ]),
  );

  const rows = await prismadb.store.findMany({ where: { userId: USER, slug: { in: ["race-create", "race-target"] } } });
  console.log(`Rows holding the raced slugs: ${rows.length} (expected 2)`);
  await prismadb.store.deleteMany({ where: { userId: USER } });

  const pass = ok.every(Boolean) && rows.length === 2;
  console.log(pass ? "ALL PASS" : "FAILED");
  process.exitCode = pass ? 0 : 1;
}

main().finally(() => prismadb.$disconnect());

/**
 * Proves the store-transfer logic on the LOCAL database (throw-away store zz-transfer-test-*, removed at the end).
 *   DATABASE_URL=<local ecom_dev url> npx tsx scripts/test-store-transfer.ts
 */
import prismadb from "@/lib/prismadb";
import { acceptTransfer, cancelTransfer, createTransfer, previewTransfer, readPending, TRANSFER_TTL_MS } from "@/lib/transfer";
import { createLink } from "@/lib/agent/store";

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " " + JSON.stringify(extra)}`);
};

async function main() {
  const a = "user_zz_a", b = "user_zz_b";
  const mk = (n: string) => prismadb.store.create({ data: { name: n, userId: a, slug: `zz-transfer-test-${n}` } });
  const s = await mk("one");
  const other = await mk("two"); // a second store of the same owner: must NOT move
  try {
    await createLink(s.id, "full");
    const t = await createToken(s.id, "Bob@Example.com ");
    check("pending is stored lowercased", (await readPending(s.id))?.email === "bob@example.com");
    check("preview ok with the right token", (await previewTransfer(s.id, t)).status === "ok");
    check("preview invalid with a wrong token", (await previewTransfer(s.id, t + "x")).status === "invalid");
    check("wrong email cannot accept", JSON.stringify(await acceptTransfer(s.id, t, b, ["eve@example.com"])) === '{"ok":false,"reason":"wrong_account"}');
    check("wrong token cannot accept", JSON.stringify(await acceptTransfer(s.id, "nope", b, ["bob@example.com"])) === '{"ok":false,"reason":"invalid"}');
    check("owner cannot accept their own store", JSON.stringify(await acceptTransfer(s.id, t, a, ["bob@example.com"])) === '{"ok":false,"reason":"already_owner"}');
    check("still owned by A", (await prismadb.store.findUnique({ where: { id: s.id } }))?.userId === a);
    const ok = await acceptTransfer(s.id, t, b, ["BOB@example.com"]);
    const after = await prismadb.store.findUnique({ where: { id: s.id } });
    check("right account accepts", ok.ok === true, ok);
    check("owner is now B", after?.userId === b);
    check("transfer cleared", after?.transfer === null);
    check("agent link removed", after?.agentAccess === null);
    check("the other store did not move", (await prismadb.store.findUnique({ where: { id: other.id } }))?.userId === a);
    check("link cannot be used twice", JSON.stringify(await acceptTransfer(s.id, t, "user_zz_c", ["bob@example.com"])) === '{"ok":false,"reason":"invalid"}');

    // cancel
    const t2 = await createToken(s.id, "carol@example.com");
    await cancelTransfer(s.id);
    check("cancelled link is dead", (await previewTransfer(s.id, t2)).status === "invalid");

    // new link replaces the old one
    const t3 = await createToken(s.id, "d@example.com");
    const t4 = await createToken(s.id, "d@example.com");
    check("a newer link replaces the older", (await previewTransfer(s.id, t3)).status === "invalid" && (await previewTransfer(s.id, t4)).status === "ok");

    // expiry
    const old = new Date(Date.now() - TRANSFER_TTL_MS - 1000).toISOString();
    const row = (await prismadb.store.findUnique({ where: { id: s.id } }))!.transfer as any;
    await prismadb.store.update({ where: { id: s.id }, data: { transfer: { ...row, createdAt: old } } });
    check("expired link: preview says expired", (await previewTransfer(s.id, t4)).status === "expired");
    check("expired link cannot be accepted", JSON.stringify(await acceptTransfer(s.id, t4, "user_zz_d", ["d@example.com"])) === '{"ok":false,"reason":"expired"}');
  } finally {
    await prismadb.store.deleteMany({ where: { slug: { startsWith: "zz-transfer-test-" } } });
    await prismadb.$disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

async function createToken(storeId: string, email: string) {
  return createTransfer(storeId, email);
}

main();

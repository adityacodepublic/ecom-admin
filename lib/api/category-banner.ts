import { billboardImagesSchema, type BillboardImage } from "@/lib/home-layout";

/** A category's billboard images from a request body. Left out (undefined) = not given. */
export function readBanner(value: unknown): { ok: true; data: BillboardImage[] | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, data: undefined };
  const r = billboardImagesSchema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  const issue = r.error.issues[0];
  return { ok: false, error: `banner${issue.path.length ? `[${issue.path.join("].")}` : ""}: ${issue.message}`.replace("].]", "]") };
}

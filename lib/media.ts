// Shared (browser and server) helpers for the image library.

export type MediaUsage = { type: "product" | "billboard" | "category" | "description"; id: string; label: string };

export type MediaItem = {
  id: string;
  url: string;
  publicId: string | null;
  source: "upload" | "url";
  name: string;
  createdAt: string;
  usedIn: MediaUsage[];
};

/** Cloudinary public id from a delivery URL, or null when it is not one. Used by the backfill. */
export function parsePublicId(url: string): string | null {
  const m = url.match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (!m) return null;
  // A resize/transform segment (w_300,c_fill) before the id makes the guess unreliable: skip it.
  if (/^[a-z]{1,3}_[^/]*\//.test(m[1])) return null;
  return decodeURIComponent(m[1]);
}

/** File name shown in the library, from a URL (without the Cloudinary random id it keeps what it has). */
export function nameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last);
  } catch {
    return "";
  }
}

/** Small thumbnail for the grid. Cloudinary files are resized by Cloudinary; other links are used as they are. */
export function thumbUrl(url: string, size = 300): string {
  return url.replace(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?!c_fill)/,
    `$1c_fill,w_${size},h_${size},q_auto,f_auto/`,
  );
}

/** Makes % _ and \ literal in a LIKE/ILIKE pattern (use with ESCAPE '\'). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

export const usageText = (u: MediaUsage) =>
  u.type === "product" ? `Product: ${u.label}`
  : u.type === "billboard" ? `Billboard: ${u.label}`
  : u.type === "category" ? `Category: ${u.label}`
  : `Description of product: ${u.label}`;

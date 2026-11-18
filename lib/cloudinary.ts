import crypto from "crypto";

// Server only. The secret comes from CLOUDINARY_URL = cloudinary://<key>:<secret>@<cloud>.
// It must never reach the browser.
function config() {
  const raw = process.env.CLOUDINARY_URL;
  const m = raw?.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!m) throw new Error("CLOUDINARY_URL is missing or not in the form cloudinary://key:secret@cloud");
  return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
}

// Cloudinary signature: sort the params, join as k=v&k=v, add the secret, SHA-1.
function sign(params: Record<string, string | number>, secret: string) {
  const text = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(text + secret).digest("hex");
}

/** Every store uploads into its own folder. */
export const storeFolder = (storeId: string) => `ecom/${storeId}`;

/** Upload limits, signed with every upload so Cloudinary enforces them (the browser cannot change them). */
export const ALLOWED_FORMATS = "jpg,jpeg,png,webp,gif,avif";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Signed upload data for the browser (image uploads only). Signed: folder, timestamp, allowed_formats and
 * max_file_size. The client must send exactly these fields back to Cloudinary or the signature fails.
 */
export function signUpload(storeId: string, maxBytes: number = MAX_FILE_BYTES, publicId?: string) {
  const { apiKey, apiSecret, cloudName } = config();
  const folder = storeFolder(storeId);
  const timestamp = Math.round(Date.now() / 1000);
  const allowed_formats = ALLOWED_FORMATS;
  const max_file_size = maxBytes;
  const signed: Record<string, string | number> = { folder, timestamp, allowed_formats, max_file_size };
  if (publicId) signed.public_id = publicId; // locks the upload to ONE asset id
  return {
    signature: sign(signed, apiSecret),
    timestamp,
    apiKey,
    cloudName,
    folder,
    allowed_formats,
    max_file_size,
    ...(publicId ? { public_id: publicId } : {}),
  };
}

/** Size in bytes of an uploaded image, from Cloudinary's Admin API (null = no such asset). Used to enforce size limits. */
export async function imageBytes(publicId: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const { apiKey, apiSecret, cloudName } = config();
  const res = await fetchImpl(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${publicId.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { Authorization: "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64") } },
  );
  if (res.status === 404) return null;
  const json = (await res.json().catch(() => ({}))) as { bytes?: number; error?: { message?: string } };
  if (!res.ok || typeof json.bytes !== "number") throw new Error(json?.error?.message || `Cloudinary error ${res.status}`);
  return json.bytes;
}

/** Signs any set of upload params (for scripts, e.g. the folder migration). Returns the signature, never the secret. */
export function signParams(params: Record<string, string | number>) {
  const { apiKey, apiSecret, cloudName } = config();
  return { apiKey, cloudName, signature: sign(params, apiSecret) };
}

export function cloudName() {
  return config().cloudName;
}

/** Deletes a file in Cloudinary. "not found" counts as success (it is already gone). */
export async function destroyImage(publicId: string): Promise<"ok" | "not found"> {
  const { apiKey, apiSecret, cloudName } = config();
  const timestamp = Math.round(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature: sign({ public_id: publicId, timestamp }, apiSecret),
  });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Cloudinary error ${res.status}`);
  if (json.result === "ok") return "ok";
  if (json.result === "not found") return "not found";
  throw new Error(`Cloudinary said: ${json.result}`);
}

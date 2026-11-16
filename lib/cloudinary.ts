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

/** Signed upload data for the browser. Only the folder and the time are signed. */
export function signUpload(storeId: string) {
  const { apiKey, apiSecret, cloudName } = config();
  const folder = storeFolder(storeId);
  const timestamp = Math.round(Date.now() / 1000);
  return { signature: sign({ folder, timestamp }, apiSecret), timestamp, apiKey, cloudName, folder };
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

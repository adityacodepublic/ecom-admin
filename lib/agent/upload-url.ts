import crypto from "crypto";

import { cloudName, destroyImage, imageBytes, signUpload, storeFolder } from "@/lib/cloudinary";

/** Agent uploads go straight to Cloudinary (Vercel rejects request bodies over 4.5 MB), so the limit is 6 MB. */
export const AGENT_MAX_FILE_MB = 6;
export const AGENT_MAX_FILE_BYTES = AGENT_MAX_FILE_MB * 1024 * 1024;
export const SIGNATURE_VALID_MINUTES = 60;

/**
 * POST {base}/upload-url. A signature for ONE direct upload: the folder, a server-generated random public_id,
 * the formats and the size are all locked into it. The agent POSTs the file to Cloudinary itself.
 */
export function createUploadUrl(storeId: string, base: string) {
  const publicId = crypto.randomBytes(12).toString("hex");
  const s = signUpload(storeId, AGENT_MAX_FILE_BYTES, publicId);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`,
    fields: {
      api_key: s.apiKey,
      timestamp: s.timestamp,
      folder: s.folder,
      allowed_formats: s.allowed_formats,
      max_file_size: s.max_file_size,
      public_id: publicId,
      signature: s.signature,
    },
    expiresInMinutes: SIGNATURE_VALID_MINUTES,
    next:
      "POST the file as multipart/form-data with these fields plus `file` to uploadUrl (max 6 MB; jpg, jpeg, png, webp, gif, avif). " +
      `Then register it with POST ${base}/media { "url": <secure_url>, "publicId": <public_id>, "source": "upload" } using the values from Cloudinary's response.`,
  };
}

export type CheckOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * Called before a source:"upload" registration runs. Cloudinary cannot be trusted to enforce max_file_size on a
 * signed upload (it is not a documented upload parameter), so the asset's real size is read from Cloudinary's
 * Admin API (never from what the agent says); an image over the limit is destroyed and refused.
 */
export async function checkUploadedImage(
  storeId: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckOutcome> {
  const b = (body && typeof body === "object" ? body : {}) as { publicId?: unknown; url?: unknown };
  const publicId = typeof b.publicId === "string" ? b.publicId : "";
  if (!publicId.startsWith(`${storeFolder(storeId)}/`)) {
    return { ok: false, status: 400, error: "Image is not in this store's folder" };
  }
  if (typeof b.url !== "string" || !b.url.startsWith(`https://res.cloudinary.com/${cloudName()}/`) || !b.url.includes(publicId)) {
    return { ok: false, status: 400, error: "Image link does not match the upload" };
  }
  let bytes: number | null;
  try {
    bytes = await imageBytes(publicId, fetchImpl);
  } catch (error) {
    console.log("[AGENT_UPLOAD_CHECK]", error);
    return { ok: false, status: 502, error: "Could not check the uploaded image. Try again." };
  }
  if (bytes === null) {
    return { ok: false, status: 400, error: "No uploaded image with this publicId. Upload the file to uploadUrl first." };
  }
  if (bytes > AGENT_MAX_FILE_BYTES) {
    await destroyImage(publicId).catch((e) => console.log("[AGENT_UPLOAD_DESTROY]", e));
    return { ok: false, status: 400, error: `Image is bigger than ${AGENT_MAX_FILE_MB} MB and was deleted.` };
  }
  return { ok: true };
}

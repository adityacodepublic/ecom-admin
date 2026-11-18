import axios from "axios";

import type { MediaItem } from "@/lib/media";

// Browser helpers for the image library: signed upload to Cloudinary, then register in our table.

export const MAX_FILE_MB = 10;

type Signed = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  allowed_formats: string;
  max_file_size: number;
};

type CloudinaryResult = { secure_url: string; public_id: string };

/** Uploads a File (or, with a string, makes Cloudinary download that link) and returns Cloudinary's answer. */
async function uploadToCloudinary(
  storeId: string,
  file: File | string,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryResult> {
  const { data: s } = await axios.post<Signed>(`/api/${storeId}/media/sign`);
  const body = new FormData();
  body.append("file", file);
  body.append("api_key", s.apiKey);
  body.append("timestamp", String(s.timestamp));
  body.append("folder", s.folder);
  body.append("allowed_formats", s.allowed_formats); // signed: must be sent exactly as given
  body.append("max_file_size", String(s.max_file_size));
  body.append("signature", s.signature);
  const res = await axios.post<CloudinaryResult>(
    `https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`,
    body,
    { onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)) },
  );
  return res.data;
}

/** Checks a file before upload. Returns an error text, or null if fine. */
export function checkFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Only image files can be uploaded.";
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Image is bigger than ${MAX_FILE_MB} MB.`;
  return null;
}

export async function uploadImage(
  storeId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MediaItem> {
  const r = await uploadToCloudinary(storeId, file, onProgress);
  const { data } = await axios.post<MediaItem>(`/api/${storeId}/media`, {
    url: r.secure_url,
    publicId: r.public_id,
    source: "upload",
    name: file.name,
  });
  return data;
}

/** Adds an https link. With copy=true Cloudinary downloads it and we own the copy; otherwise only the link is kept. */
export async function addImageLink(storeId: string, link: string, copy: boolean): Promise<MediaItem> {
  if (copy) {
    const r = await uploadToCloudinary(storeId, link);
    const { data } = await axios.post<MediaItem>(`/api/${storeId}/media`, {
      url: r.secure_url,
      publicId: r.public_id,
      source: "upload",
    });
    return data;
  }
  const { data } = await axios.post<MediaItem>(`/api/${storeId}/media`, { url: link, source: "url" });
  return data;
}

export function errorText(e: unknown, fallback = "Something went wrong."): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data;
    if (typeof d === "string" && d) return d;
    if (d?.error?.message) return d.error.message; // Cloudinary
    if (d?.error) return String(d.error);
  }
  return fallback;
}

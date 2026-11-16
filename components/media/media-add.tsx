"use client";

import { useRef, useState } from "react";
import { Check, CloudUpload, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/lib/media";
import { MAX_FILE_MB, addImageLink, checkFile, errorText, uploadImage } from "@/lib/media-client";

type Job = { id: number; name: string; percent: number; state: "uploading" | "done" | "error"; error?: string };

/** Upload tab: drag and drop or browse. Every upload goes to the store's folder and into the library. */
export function UploadTab({
  storeId,
  multiple,
  onUploaded,
}: {
  storeId: string;
  multiple: boolean;
  onUploaded: (item: MediaItem) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (id: number, p: Partial<Job>) => setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const start = (files: FileList | File[]) => {
    const list = Array.from(files);
    const picked = multiple ? list : list.slice(0, 1);
    if (!multiple) setJobs([]);
    for (const file of picked) {
      const id = nextId.current++;
      const problem = checkFile(file);
      setJobs((cur) => [
        ...cur,
        { id, name: file.name, percent: 0, state: problem ? "error" : "uploading", error: problem ?? undefined },
      ]);
      if (problem) continue;
      uploadImage(storeId, file, (percent) => patch(id, { percent }))
        .then((item) => {
          patch(id, { percent: 100, state: "done" });
          onUploaded(item);
        })
        .catch((e) => patch(id, { state: "error", error: errorText(e, "Upload failed.") }));
    }
  };

  return (
    <div className="space-y-4 pb-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) start(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-12 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-border bg-muted/40",
        )}
      >
        <CloudUpload className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">{multiple ? "Drag and drop images here" : "Drag and drop an image here"}</p>
        <p className="text-sm text-muted-foreground">or</p>
        <Button type="button" onClick={() => inputRef.current?.click()}>
          Browse
        </Button>
        <p className="text-xs text-muted-foreground">Images only, up to {MAX_FILE_MB} MB each</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) start(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{j.name}</span>
                {j.state === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {j.state === "done" && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Check className="h-4 w-4" /> Added to library and selected
                  </span>
                )}
                {j.state === "error" && <X className="h-4 w-4 text-destructive" />}
              </div>
              {j.state === "uploading" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${j.percent}%` }} />
                </div>
              )}
              {j.state === "error" && <p className="mt-1 text-destructive">{j.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** From URL tab: keep only the link, or copy the image into the store's Cloudinary folder. */
export function UrlTab({ storeId, onAdded }: { storeId: string; onAdded: (item: MediaItem) => void }) {
  const [link, setLink] = useState("");
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);

  const valid = /^https:\/\/\S+$/.test(link.trim());

  const add = async () => {
    setBusy(true);
    try {
      const item = await addImageLink(storeId, link.trim(), copy);
      onAdded(item);
      toast.success("Added to library and selected.");
      setLink("");
    } catch (e) {
      toast.error(errorText(e, "Could not add this link."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4 pb-2">
      <div className="space-y-2">
        <label htmlFor="media-link" className="text-sm font-medium">
          Image link
        </label>
        <Input
          id="media-link"
          placeholder="https://example.com/photo.jpg"
          value={link}
          disabled={busy}
          onChange={(e) => {
            setLink(e.target.value);
            setBroken(false);
          }}
        />
        {link.trim() !== "" && !valid && <p className="text-sm text-destructive">The link must start with https://</p>}
      </div>

      {valid && (
        <div className="flex h-40 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {broken ? (
            <span className="text-sm text-muted-foreground">Cannot show a preview of this link</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.trim()} alt="Preview" className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={copy} onCheckedChange={(v) => setCopy(v === true)} disabled={busy} />
        Create and use a copy of this image, else used directly
      </label>

      <Button type="button" disabled={!valid || busy} onClick={add}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Add to library
      </Button>
    </div>
  );
}

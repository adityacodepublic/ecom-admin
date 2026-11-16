"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import { ArrowLeft, Check, ImageOff, Info, Loader2, Search } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { thumbUrl, usageText, type MediaItem } from "@/lib/media";
import { errorText } from "@/lib/media-client";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  storeId: string;
  multiple: boolean;
  selected: MediaItem[];
  existingUrls: string[];
  onToggle: (item: MediaItem) => void;
  onDeleted: (url: string) => void;
  onGoUpload: () => void;
}

/** Library tab: the images this store already has. Search, sort, Unused filter, details and delete. */
export function MediaLibrary({ storeId, multiple, selected, existingUrls, onToggle, onDeleted, onGoUpload }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [filter, setFilter] = useState("all");
  const [details, setDetails] = useState<MediaItem | null>(null);
  const requestId = useRef(0);

  // Wait a moment after typing before searching.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (p: number) => {
      const id = ++requestId.current;
      setLoading(true);
      setFailed(false);
      try {
        const { data } = await axios.get<{ items: MediaItem[]; hasMore: boolean }>(`/api/${storeId}/media`, {
          params: { q, sort, filter, page: p },
        });
        if (id !== requestId.current) return; // an older request: ignore
        setItems((cur) => (p === 0 ? data.items : [...cur, ...data.items]));
        setHasMore(data.hasMore);
        setPage(p);
      } catch {
        if (id === requestId.current) setFailed(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [storeId, q, sort, filter],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const isSelected = (url: string) => selected.findIndex((s) => s.url === url);
  const filtering = q !== "" || filter !== "all";

  const removeFromList = (item: MediaItem) => {
    setItems((cur) => cur.filter((i) => i.id !== item.id));
    onDeleted(item.url);
    setDetails(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name"
            className="pl-9"
            aria-label="Search by file name"
          />
        </div>
        <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A-Z</option>
        </select>
        <select className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
          <option value="all">All images</option>
          <option value="unused">Unused only</option>
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
        {failed && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            Could not load the library.
            <Button type="button" variant="outline" onClick={() => load(0)}>
              Try again
            </Button>
          </div>
        )}

        {!failed && !loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ImageOff className="h-10 w-10 text-muted-foreground" />
            {filtering ? (
              <p className="text-sm text-muted-foreground">No images match.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No images yet. Upload your first image.</p>
                <Button type="button" onClick={onGoUpload}>
                  Upload an image
                </Button>
              </>
            )}
          </div>
        )}

        {items.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {items.map((item) => {
              const idx = isSelected(item.url);
              const added = existingUrls.includes(item.url);
              return (
                <li key={item.id} className="min-w-0">
                  <div className="relative">
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => onToggle(item)}
                      aria-pressed={idx >= 0}
                      aria-label={`${idx >= 0 ? "Unselect" : "Select"} ${item.name || "image"}`}
                      className={cn(
                        "relative block aspect-square w-full overflow-hidden rounded-md border bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                        idx >= 0 && "ring-2 ring-primary",
                        added && "opacity-50",
                      )}
                    >
                      <Thumb url={item.url} />
                      {idx >= 0 && (
                        <span className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
                          {multiple ? idx + 1 : <Check className="h-4 w-4" />}
                        </span>
                      )}
                      {added && (
                        <span className="absolute bottom-1.5 left-1.5 rounded bg-background/90 px-1.5 py-0.5 text-xs text-foreground">
                          Added
                        </span>
                      )}
                      {!added && item.usedIn.length > 0 && (
                        <span className="absolute bottom-1.5 left-1.5 rounded bg-background/90 px-1.5 py-0.5 text-xs text-foreground">
                          Used in {item.usedIn.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetails(item)}
                      aria-label="Details"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground" title={item.name}>
                    {item.name || "image"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && hasMore && (
          <div className="flex justify-center py-4">
            <Button type="button" variant="outline" onClick={() => load(page + 1)}>
              Load more
            </Button>
          </div>
        )}
      </div>

      {details && (
        <DetailsPanel
          storeId={storeId}
          item={details}
          onBack={() => setDetails(null)}
          onDeleted={removeFromList}
        />
      )}
    </div>
  );
}

/** Small square picture. Falls back to an icon when the file is gone. */
function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
        <ImageOff className="h-6 w-6" />
        Missing file
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbUrl(url)} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />;
}

function DetailsPanel({
  storeId,
  item,
  onBack,
  onDeleted,
}: {
  storeId: string;
  item: MediaItem;
  onBack: () => void;
  onDeleted: (item: MediaItem) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const used = item.usedIn.length > 0;

  const remove = async () => {
    setBusy(true);
    try {
      await axios.delete(`/api/${storeId}/media/${item.id}`);
      toast.success("Image deleted.");
      onDeleted(item);
    } catch (e) {
      toast.error(errorText(e, "Could not delete the image."));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-2 sm:px-6">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(item.url, 800)} alt="" className="max-h-[50vh] w-full object-contain" />
          </div>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">File name</p>
              <p className="break-all font-medium">{item.name || "(no name)"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Added</p>
              <p>{format(new Date(item.createdAt), "d MMM yyyy, h:mm a")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Kind</p>
              <p>{item.source === "upload" ? "Stored in your Cloudinary" : "Link only (file is on another site)"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Used in</p>
              {used ? (
                <ul className="list-disc pl-5">
                  {item.usedIn.map((u) => (
                    <li key={`${u.type}-${u.id}`}>{usageText(u)}</li>
                  ))}
                </ul>
              ) : (
                <p>Not used anywhere</p>
              )}
            </div>

            <div className="border-t pt-4">
              {used ? (
                <>
                  <Button type="button" variant="destructive" disabled>
                    Delete image
                  </Button>
                  <p className="mt-2 text-muted-foreground">
                    This image is used in {item.usedIn.length} {item.usedIn.length === 1 ? "place" : "places"}. Remove it
                    from {item.usedIn.length === 1 ? "there" : "them"} first, then you can delete it.
                  </p>
                </>
              ) : confirming ? (
                <div className="space-y-2">
                  <p>
                    {item.source === "upload"
                      ? "Delete this image for good? The file is removed from your storage."
                      : "Remove this link from your library?"}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" disabled={busy} onClick={remove}>
                      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Yes, delete
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
                  Delete image
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

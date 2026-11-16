"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown-editor.css";
import { MediaPicker } from "@/components/media/media-picker";
import type { MediaItem } from "@/lib/media";
import { checkFile, uploadImage } from "@/lib/media-client";

interface MarkdownEditorProps {
  /** Initial Markdown. Changes after mount are ignored: the editor owns the text. */
  value: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
}

/**
 * Visual Markdown editor (Milkdown Crepe). The image block's "upload" button opens the shared
 * picker (Upload / From URL / Library). A pasted link still works. Load it with next/dynamic and ssr: false.
 */
const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, disabled }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const params = useParams();
  const storeIdRef = useRef(params.storeId as string);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The image block's hidden file input that asked for a picture, and the url the picker chose for it.
  const pendingInput = useRef<HTMLInputElement | null>(null);
  const pickedUrl = useRef<string | null>(null);

  // The picker chose an image: hand its url to the image block through its own file input.
  const onPick = (items: MediaItem[]) => {
    const input = pendingInput.current;
    pendingInput.current = null;
    if (!items[0] || !input || !input.isConnected) return;
    pickedUrl.current = items[0].url;
    const transfer = new DataTransfer();
    transfer.items.add(new File(["x"], "library-image", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: { [Crepe.Feature.Latex]: false },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          // The url comes from the picker. A real file (pasted or dropped into the editor) is uploaded
          // into the library here.
          onUpload: async (file: File) => {
            const picked = pickedUrl.current;
            pickedUrl.current = null;
            if (picked) return picked;
            if (checkFile(file)) return "";
            return (await uploadImage(storeIdRef.current, file)).url;
          },
        },
      },
    });
    crepe.on((listener) => listener.markdownUpdated((_ctx, markdown) => onChangeRef.current(markdown)));

    // The "upload" button would open the computer's file dialog: open the shared picker instead.
    const onFileClick = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "file") {
        e.preventDefault();
        pendingInput.current = t;
        setPickerOpen(true);
      }
    };
    root.addEventListener("click", onFileClick, true);

    // The editor lives inside the product <form>: a button without a type would submit it.
    const noSubmit = () =>
      root.querySelectorAll("button:not([type])").forEach((b) => b.setAttribute("type", "button"));
    const observer = new MutationObserver(noSubmit);
    observer.observe(root, { childList: true, subtree: true });

    const ready = crepe.create().then(() => {
      noSubmit();
      crepe.setReadonly(!!disabled);
    });

    return () => {
      observer.disconnect();
      root.removeEventListener("click", onFileClick, true);
      ready.then(() => crepe.destroy());
    };
    // Created once: the editor keeps its own state afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={rootRef} className="markdown-editor rounded-md border bg-background" />
      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} multiple={false} onSelect={onPick} />
    </>
  );
};

export default MarkdownEditor;

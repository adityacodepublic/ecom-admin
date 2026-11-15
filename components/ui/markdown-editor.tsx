"use client";

import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown-editor.css";

// Same unsigned preset the product image uploader uses.
const CLOUDINARY_PRESET = "ecommtest";

async function uploadToCloudinary(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", CLOUDINARY_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body }
  );
  if (!res.ok) throw new Error("Image upload failed");
  return (await res.json()).secure_url;
}

interface MarkdownEditorProps {
  /** Initial Markdown. Changes after mount are ignored: the editor owns the text. */
  value: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
}

/**
 * Visual Markdown editor (Milkdown Crepe). Images can be uploaded (stored on Cloudinary)
 * or added from a pasted link. Load it with next/dynamic and ssr: false.
 */
const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, disabled }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: { [Crepe.Feature.Latex]: false },
      featureConfigs: { [Crepe.Feature.ImageBlock]: { onUpload: uploadToCloudinary } },
    });
    crepe.on((listener) => listener.markdownUpdated((_ctx, markdown) => onChangeRef.current(markdown)));

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
      ready.then(() => crepe.destroy());
    };
    // Created once: the editor keeps its own state afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={rootRef} className="markdown-editor rounded-md border bg-background" />;
};

export default MarkdownEditor;

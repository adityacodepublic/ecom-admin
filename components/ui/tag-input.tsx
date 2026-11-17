"use client";

import { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxLength?: number;
  maxTags?: number;
  disabled?: boolean;
  id?: string;
}

/** A list the user builds one item at a time: type, press Enter (or comma), and it becomes a removable chip. */
export const TagInput = ({ value, onChange, placeholder = "Type and press Enter", maxLength = 60, maxTags = 12, disabled, id }: TagInputProps) => {
  const [text, setText] = useState("");

  const add = () => {
    const t = text.trim().replace(/\s+/g, " ");
    setText("");
    if (!t || value.length >= maxTags || value.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-50",
      )}
    >
      {value.map((v) => (
        <Badge key={v} variant="secondary" className="gap-1 pr-1">
          {v}
          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${v}`}
            className="rounded-sm hover:bg-muted-foreground/20"
            onClick={() => onChange(value.filter((x) => x !== v))}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={text}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
      />
    </div>
  );
};

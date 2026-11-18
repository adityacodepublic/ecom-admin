"use client";

import { cn } from "@/lib/utils";

const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] => v !== null && typeof v === "object";

const Scalar = ({ value }: { value: unknown }) => {
  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "string") return <span className="break-all text-emerald-700 dark:text-emerald-400">“{value}”</span>;
  if (typeof value === "number") return <span className="text-blue-700 dark:text-blue-400">{value}</span>;
  return <span className="text-amber-700 dark:text-amber-400">{String(value)}</span>;
};

const summary = (v: unknown[] | Record<string, unknown>) => {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length;
  return Array.isArray(v) ? `[ ${n} item${n === 1 ? "" : "s"} ]` : `{ ${n} key${n === 1 ? "" : "s"} }`;
};

/** One row: "key: value". Objects and arrays open into an indented list. Every key and value is shown. */
const Node = ({ name, value, depth, openDepth }: { name?: string; value: unknown; depth: number; openDepth: number }) => {
  const label = name !== undefined ? <span className="text-muted-foreground">{name}: </span> : null;
  if (!isContainer(value)) {
    return (
      <div className="py-0.5">
        {label}
        <Scalar value={value} />
      </div>
    );
  }
  const entries: [string, unknown][] = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  if (entries.length === 0) {
    return (
      <div className="py-0.5">
        {label}
        <span className="text-muted-foreground">{Array.isArray(value) ? "[ ]" : "{ }"}</span>
      </div>
    );
  }
  return (
    <details open={depth < openDepth} className="py-0.5">
      <summary className="cursor-pointer select-none">
        {label}
        <span className="text-muted-foreground">{summary(value)}</span>
      </summary>
      <div className="ml-2 border-l pl-3">
        {entries.map(([k, v]) => (
          <Node key={k} name={k} value={v} depth={depth + 1} openDepth={openDepth} />
        ))}
      </div>
    </details>
  );
};

/** Readable, collapsible view of any JSON value. Nothing is hidden: collapsed rows still list their size. */
export const JsonTree = ({ value, className, openDepth = 2 }: { value: unknown; className?: string; openDepth?: number }) => (
  <div className={cn("max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed", className)}>
    <Node value={value} depth={0} openDepth={openDepth} />
  </div>
);

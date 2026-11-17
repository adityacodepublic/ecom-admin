import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: (p) => <h1 className="mt-4 mb-2 text-xl font-bold" {...p} />,
  h2: (p) => <h2 className="mt-4 mb-2 text-lg font-bold" {...p} />,
  h3: (p) => <h3 className="mt-3 mb-2 font-semibold" {...p} />,
  p: (p) => <p className="my-2 leading-6" {...p} />,
  ul: (p) => <ul className="my-2 list-disc space-y-1 pl-6" {...p} />,
  ol: (p) => <ol className="my-2 list-decimal space-y-1 pl-6" {...p} />,
  a: (p) => <a className="text-primary underline" target="_blank" rel="noopener noreferrer" {...p} />,
  img: ({ src, alt }) =>
    typeof src === "string" ? <img src={src} alt={alt ?? ""} className="my-3 h-auto max-w-full rounded-md" /> : null,
  blockquote: (p) => <blockquote className="my-3 border-l-4 pl-3 text-muted-foreground" {...p} />,
  pre: (p) => <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 text-sm" {...p} />,
  code: (p) => <code className="rounded bg-muted px-1 py-0.5 text-sm" {...p} />,
  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="border bg-muted px-2 py-1 text-left font-semibold" {...p} />,
  td: (p) => <td className="border px-2 py-1" {...p} />,
  hr: () => <hr className="my-4" />,
};

/** Shows Markdown safely: raw HTML in the text is NOT rendered (react-markdown skips it by default). */
export const MarkdownView = ({ children }: { children: string }) => (
  <div className="break-words text-sm">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  </div>
);

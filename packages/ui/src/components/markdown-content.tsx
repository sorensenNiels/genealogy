import Markdown, { type Components } from "react-markdown";

import { cn } from "../lib/utils";

// Only the elements MarkdownEditor's toolbar can actually produce (headings,
// lists, blockquote, bold/italic, links, a horizontal rule) get an explicit
// style — anything else pasted in as raw markdown still renders, just with
// the browser's own default element styling rather than a themed one.
const components: Components = {
  h1: ({ className, children, ...props }) => (
    <h1 className={cn("text-lg font-semibold", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2 className={cn("text-base font-semibold", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3 className={cn("text-sm font-semibold", className)} {...props}>
      {children}
    </h3>
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("list-disc space-y-0.5 pl-5", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("list-decimal space-y-0.5 pl-5", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground", className)}
      {...props}
    />
  ),
  a: ({ className, children, ...props }) => (
    <a className={cn("underline underline-offset-2 hover:no-underline", className)} {...props}>
      {children}
    </a>
  ),
  hr: ({ className, ...props }) => <hr className={cn("border-border", className)} {...props} />,
};

/**
 * Read-only rendering for text stored as markdown — the display-side
 * counterpart to `MarkdownEditor`. Plain `react-markdown`, no browser APIs
 * touched, so unlike `MarkdownEditor` this renders identically during SSR.
 */
export function MarkdownContent({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5 text-sm [&>*:first-child]:mt-0", className)}>
      <Markdown components={components}>{children}</Markdown>
    </div>
  );
}

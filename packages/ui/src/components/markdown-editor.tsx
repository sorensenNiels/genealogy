import "@mdxeditor/editor/style.css";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  ListsToggle,
  listsPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import { useEffect, useState } from "react";

import { useTheme } from "../hooks/use-theme";
import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";
import { MarkdownContent } from "./markdown-content";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}

const fieldClassName =
  "w-full rounded-md border border-input bg-transparent text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50";

// Defined once at module scope, not inline in the plugin list below — an
// inline arrow function there renders the same JSX either way, but trips
// oxlint's "no component defined during render" check regardless.
function EditorToolbar() {
  return (
    <>
      <UndoRedo />
      <Separator />
      <BoldItalicUnderlineToggles />
      <Separator />
      <BlockTypeSelect />
      <ListsToggle />
      <CreateLink />
    </>
  );
}

/**
 * WYSIWYG editor whose storage format is plain markdown text — MDXEditor
 * parses markdown in and serializes markdown back out on every change, so
 * callers never see or store HTML/JSON. See "Markdown notes" in
 * TECH_STACK.md for why this over Tiptap.
 *
 * Built on Lexical, which touches `contentEditable`/`window` at mount and
 * cannot render on the server. Like `use-theme.ts`, this starts from a
 * plain, fully-functional placeholder (a bare textarea bound to the same
 * value/onChange) during SSR and the initial client render, then swaps to
 * the real editor once mounted — never a blank gap while hydration catches up.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  ...props
}: MarkdownEditorProps) {
  const isReadOnly = useReadOnly();
  const [isMounted, setIsMounted] = useState(false);
  const { theme } = useTheme();
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- SSR safety, see use-theme.ts
    setIsMounted(true);
  }, []);

  // Read-only: the note as it reads, not an editor someone can't save from.
  if (isReadOnly) {
    return value.trim() === "" ? null : (
      <MarkdownContent className={cn("text-sm", className)}>{value}</MarkdownContent>
    );
  }

  if (!isMounted) {
    return (
      <textarea
        className={cn(
          fieldClassName,
          "min-h-24 px-3 py-2 outline-none placeholder:text-muted-foreground",
          className,
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(props["aria-label"] !== undefined ? { "aria-label": props["aria-label"] } : {})}
      />
    );
  }

  return (
    <div
      className={cn(
        fieldClassName,
        "overflow-hidden [&_.mdxeditor-root-contenteditable]:min-h-24",
        // MDXEditor's own stylesheet sizes toolbar icons/padding for a
        // full-page document editor. Its rules and these both have plain
        // single-class specificity, and whichever the bundler happens to
        // emit last wins the tie — `!` makes these unconditional instead of
        // depending on that import order.
        "**:[[role='toolbar']_svg]:size-4! **:[[role='toolbar']]:min-h-0! **:[[role='toolbar']]:gap-0.5! **:[[role='toolbar']]:p-1!",
        className,
      )}
      {...(props["aria-label"] !== undefined ? { "aria-label": props["aria-label"] } : {})}
    >
      <MDXEditor
        markdown={value}
        onChange={(markdown) => onChange(markdown)}
        {...(placeholder !== undefined ? { placeholder } : {})}
        // MDXEditor ships its own light/dark stylesheet, toggled by this
        // class rather than by inheriting our `.dark` on <html> — without
        // it, the editor stays in its light palette regardless of the app's
        // theme, and its text color can end up unreadable against our own
        // dark background.
        {...(theme === "dark" ? { className: "dark-theme" } : {})}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          thematicBreakPlugin(),
          toolbarPlugin({ toolbarContents: EditorToolbar }),
        ]}
      />
    </div>
  );
}

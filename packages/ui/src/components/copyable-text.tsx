import { CheckIcon, CopyIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { useCopyToClipboard } from "../hooks/use-copy-to-clipboard";
import { cn } from "../lib/utils";

export interface CopyableTextProps extends Omit<ComponentProps<"button">, "onClick" | "children"> {
  value: string;
}

/**
 * Shown text that copies itself to the clipboard on click, with a brief
 * checkmark confirming it worked. A plain native `<button>` rather than this
 * package's `Button` — there's no press/hover-unification need here that
 * react-aria-components would earn its keep for, just a click handler.
 */
export function CopyableText({ value, className, ...props }: CopyableTextProps) {
  const { copy, copied } = useCopyToClipboard();
  return (
    <button
      type="button"
      data-slot="copyable-text"
      onClick={() => copy(value)}
      className={cn(
        "group inline-flex items-center gap-1 rounded-sm font-mono text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      {value}
      {copied ? (
        <CheckIcon className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <CopyIcon
          className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
      <span className="sr-only">{copied ? "Copied" : "Copy to clipboard"}</span>
    </button>
  );
}

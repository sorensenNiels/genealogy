import type { ReactNode } from "react";
import { OverlayArrow, Tooltip as RACTooltip, TooltipTrigger } from "react-aria-components";

import { cn } from "../lib/utils";

/** The trigger goes directly inside as the first child — no separate Trigger component needed. */
export { TooltipTrigger as Tooltip };

export function TooltipContent({
  className,
  offset = 8,
  children,
}: {
  className?: string;
  offset?: number;
  children: ReactNode;
}) {
  return (
    <RACTooltip
      offset={offset}
      className={cn(
        "rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md",
        "transition-all duration-100 data-entering:scale-95 data-entering:opacity-0 data-exiting:opacity-0",
        typeof className === "string" ? className : undefined,
      )}
    >
      <OverlayArrow>
        <svg width={8} height={8} viewBox="0 0 8 8" className="fill-foreground">
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      {children}
    </RACTooltip>
  );
}

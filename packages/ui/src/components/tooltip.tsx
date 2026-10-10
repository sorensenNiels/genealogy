import type { ReactElement, ReactNode } from "react";

import { Tooltip as TooltipRoot, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export interface TooltipProps {
  /** What the tooltip says. */
  content: ReactNode;
  /** The one element it describes — usually a `Button`; it must forward props and `ref`. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right" | undefined;
}

/**
 * A tooltip around one trigger element: `<Tooltip content="Add"><Button …/></Tooltip>`.
 * Any other props given to `Tooltip` itself pass through to that element —
 * which is what lets a tooltipped button be the `trigger` of a `Dialog`,
 * `DropdownMenu` or `Popover`: their trigger props reach the button through
 * this one.
 */
export function Tooltip({ content, children, side, ...triggerProps }: TooltipProps) {
  return (
    <TooltipRoot>
      <TooltipTrigger {...triggerProps} render={children} />
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  );
}

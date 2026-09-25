import {
  ProgressBar as RACProgressBar,
  type ProgressBarProps as RACProgressBarProps,
} from "react-aria-components";

import { cn } from "../lib/utils";

export interface ProgressBarProps extends Omit<RACProgressBarProps, "children"> {
  label?: string;
  className?: string;
}

/**
 * A determinate progress bar — a label, a filled track, and the percentage
 * as text (screen readers get the same number via React Aria's `valueText`,
 * not just the bar's width). Built on React Aria's `ProgressBar` rather than
 * a plain styled `<div>` so the `role="progressbar"`/`aria-valuenow` wiring
 * comes for free.
 */
export function ProgressBar({ label, className, ...props }: ProgressBarProps) {
  return (
    <RACProgressBar className={cn("w-full", className)} {...props}>
      {({ percentage, valueText }) => (
        <div className="space-y-1">
          {label && <p className="text-xs text-muted-foreground">{label}</p>}
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percentage ?? 0}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{valueText}</span>
          </div>
        </div>
      )}
    </RACProgressBar>
  );
}

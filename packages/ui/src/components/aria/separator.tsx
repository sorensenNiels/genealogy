import { Separator as RACSeparator, type SeparatorProps } from "react-aria-components";

import { cn } from "../../lib/utils";

/**
 * A React Aria separator, styled to match the Base UI `Separator`, for the
 * components still on React Aria — a React Aria `Menu` builds its items from
 * collection-aware children, and a non-React-Aria separator inside it drops
 * every item after it. Internal to this package; the app uses `Separator`.
 */
export function AriaSeparator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <RACSeparator
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
        className,
      )}
      {...props}
    />
  );
}

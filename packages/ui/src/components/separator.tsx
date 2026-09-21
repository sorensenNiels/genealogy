import { Separator as RACSeparator, type SeparatorProps } from "react-aria-components";

import { cn } from "../lib/utils";

export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <RACSeparator
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "vertical" ? "h-full w-px" : "h-px w-full",
        className,
      )}
      {...props}
    />
  );
}

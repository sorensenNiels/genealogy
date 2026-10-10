import { CheckIcon } from "lucide-react";
import {
  Checkbox as RACCheckbox,
  type CheckboxProps as RACCheckboxProps,
} from "react-aria-components";

import { cn } from "../../lib/utils";

/**
 * A React Aria checkbox, styled to match the Base UI `Checkbox`, for the
 * components that stay on React Aria (see "shadcn/ui on Base UI" in
 * TECH_STACK.md) — e.g. `PhotoGrid`'s `slot="selection"`, which only a
 * React Aria checkbox can fill. Internal to this package; the app uses
 * `Checkbox`.
 */
export function AriaCheckbox({
  className,
  ...props
}: Omit<RACCheckboxProps, "children" | "className"> & { className?: string }) {
  return (
    <RACCheckbox {...props} className={cn("group inline-flex", className)}>
      <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors group-data-focus-visible:ring-3 group-data-focus-visible:ring-ring/50 group-data-selected:border-primary group-data-selected:bg-primary group-data-selected:text-primary-foreground dark:bg-input/30 dark:group-data-selected:bg-primary">
        <CheckIcon className="hidden size-3.5 group-data-selected:block" />
      </span>
    </RACCheckbox>
  );
}

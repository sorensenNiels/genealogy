import { CheckIcon, MinusIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Checkbox as RACCheckbox,
  type CheckboxProps as RACCheckboxProps,
} from "react-aria-components";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export function Checkbox({
  className,
  children,
  ...props
}: Omit<RACCheckboxProps, "children" | "className"> & {
  className?: string;
  children?: ReactNode;
}) {
  const isReadOnly = useReadOnly();
  return (
    <RACCheckbox
      {...(isReadOnly ? { isReadOnly: true } : {})}
      data-slot="checkbox"
      className={cn(
        "group inline-flex items-center gap-2 text-sm data-disabled:cursor-not-allowed data-disabled:opacity-50",
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    >
      {(renderProps) => (
        <>
          <div className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-transparent shadow-xs transition-colors group-data-focus-visible:ring-[3px] group-data-focus-visible:ring-ring/50 group-data-indeterminate:border-primary group-data-indeterminate:bg-primary group-data-indeterminate:text-primary-foreground group-data-selected:border-primary group-data-selected:bg-primary group-data-selected:text-primary-foreground">
            {renderProps.isIndeterminate ? (
              <MinusIcon className="size-3" />
            ) : renderProps.isSelected ? (
              <CheckIcon className="size-3" />
            ) : null}
          </div>
          {children}
        </>
      )}
    </RACCheckbox>
  );
}

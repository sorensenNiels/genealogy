import type { ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";
import { Checkbox as CheckboxPrimitive } from "./ui/checkbox";

export interface CheckboxProps {
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  indeterminate?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  name?: string | undefined;
  /** Needed only when there's no visible label (`children`). */
  "aria-label"?: string | undefined;
  className?: string | undefined;
  /** The visible label, clickable along with the box. */
  children?: ReactNode | undefined;
}

/**
 * A checkbox with its label: the vendor primitive is just the box, so this
 * wraps both in one `<label>` (clicking the text toggles it, and the text
 * names it for screen readers) and turns read-only inside a
 * `ReadOnlyProvider`. `onCheckedChange` gets the plain boolean — Base UI's
 * event details aren't something any call site needs.
 */
export function Checkbox({ onCheckedChange, className, children, ...props }: CheckboxProps) {
  const isReadOnly = useReadOnly();
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-sm has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50",
        className,
      )}
    >
      <CheckboxPrimitive
        {...props}
        readOnly={isReadOnly}
        onCheckedChange={(checked) => onCheckedChange?.(checked)}
      />
      {children}
    </label>
  );
}

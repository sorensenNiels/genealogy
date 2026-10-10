import { useId, type ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";
import { Switch as SwitchPrimitive } from "./ui/switch";

export interface SwitchProps {
  checked?: boolean | undefined;
  defaultChecked?: boolean | undefined;
  onCheckedChange?: ((checked: boolean) => void) | undefined;
  disabled?: boolean | undefined;
  name?: string | undefined;
  /** Needed only when there's no visible label (`children`). */
  "aria-label"?: string | undefined;
  className?: string | undefined;
  /** The visible label, clickable along with the switch. */
  children?: ReactNode | undefined;
  /** Help text under the label, linked to the switch via `aria-describedby`. */
  description?: ReactNode | undefined;
}

/**
 * A switch with its label — the same composition as `Checkbox`: one
 * `<label>` around primitive and text, read-only inside a
 * `ReadOnlyProvider`, and a plain-boolean `onCheckedChange`. A
 * `description` sits under the label text, outside the `<label>` so it
 * describes the switch rather than becoming part of its name.
 */
export function Switch({
  onCheckedChange,
  className,
  children,
  description,
  ...props
}: SwitchProps) {
  const isReadOnly = useReadOnly();
  const descriptionId = useId();
  const control = (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-sm has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50",
        description ? undefined : className,
      )}
    >
      <SwitchPrimitive
        {...props}
        aria-describedby={description ? descriptionId : undefined}
        readOnly={isReadOnly}
        onCheckedChange={(checked) => onCheckedChange?.(checked)}
      />
      {children}
    </label>
  );
  if (!description) return control;
  return (
    <div className={cn("space-y-1", className)}>
      {control}
      {/* ps-10 = the switch's 32px width + the label's gap-2, so the help text
          lines up under the label text, not under the switch. */}
      <p id={descriptionId} className="ps-10 text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

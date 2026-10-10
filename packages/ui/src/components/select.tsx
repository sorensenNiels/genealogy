import type { ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export interface SelectOption<V extends string> {
  value: V;
  label: ReactNode;
  disabled?: boolean | undefined;
}

export interface SelectProps<V extends string> {
  options: readonly SelectOption<V>[];
  /** `null` shows the placeholder. */
  value: V | null;
  /** Gets one of the `options`' own values — typed, no narrowing needed at the call site. */
  onValueChange: (value: V) => void;
  /** Names the field for screen readers when there's no visible label pointing at it. */
  "aria-label"?: string | undefined;
  placeholder?: ReactNode | undefined;
  disabled?: boolean | undefined;
  size?: "sm" | "default" | undefined;
  /** Applies to the trigger — usually a width, e.g. `w-56`. */
  className?: string | undefined;
}

/**
 * A dropdown of `options`: `<Select value={v} onValueChange={setV} options={[{ value, label }]} />`.
 * The value type comes from the options, so `onValueChange` hands back
 * exactly that type. Disabled inside a `ReadOnlyProvider`.
 */
export function Select<V extends string>({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  placeholder,
  disabled,
  size = "default",
  className,
}: SelectProps<V>) {
  const isReadOnly = useReadOnly();
  return (
    <SelectRoot
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next as V);
      }}
      disabled={disabled === true || isReadOnly}
    >
      <SelectTrigger aria-label={ariaLabel} size={size} className={cn(className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}

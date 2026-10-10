import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export interface ButtonRadioGroupOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface ButtonRadioGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly ButtonRadioGroupOption<T>[];
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

const optionClassName = cn(
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none",
  "border-input bg-secondary text-secondary-foreground hover:bg-secondary/80",
  "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-checked:hover:bg-primary/90",
  "focus-visible:ring-3 focus-visible:ring-ring/50",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
);

/**
 * A radio group that reads as a row of buttons — the selected option filled
 * like the primary button, the rest like secondary ones — rather than dots
 * and labels. Base UI's RadioGroup/Radio underneath, so it's still a
 * `radiogroup` of `radio`s with arrow-key navigation, not a row of toggle
 * buttons. Read-only inside a `ReadOnlyProvider`.
 */
export function ButtonRadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  disabled,
  className,
}: ButtonRadioGroupProps<T>) {
  const isReadOnly = useReadOnly();
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      readOnly={isReadOnly}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((option) => (
        <Radio.Root key={option.value} value={option.value} className={optionClassName}>
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

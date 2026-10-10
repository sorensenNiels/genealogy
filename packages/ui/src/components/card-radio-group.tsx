import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export interface CardRadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode | undefined;
  /** A picture of the option (a theme's colors, a layout). Decorative: hidden from screen readers, and it must not contain anything interactive. */
  preview?: ReactNode | undefined;
}

export interface CardRadioGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly CardRadioOption<T>[];
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  className?: string | undefined;
}

/**
 * One choice from a set of options shown as cards, each with an optional
 * preview picture above its label — for choices that are easier to see than
 * to name (a theme). Base UI's RadioGroup underneath: a `radiogroup` of
 * `radio`s with arrow-key navigation, the checked card ringed in the primary
 * color. Read-only inside a `ReadOnlyProvider`.
 */
export function CardRadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  className,
}: CardRadioGroupProps<T>) {
  const isReadOnly = useReadOnly();
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      readOnly={isReadOnly}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3", className)}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left text-card-foreground transition-shadow outline-none",
            "hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "data-checked:border-primary data-checked:ring-2 data-checked:ring-primary",
            "data-disabled:cursor-not-allowed data-disabled:opacity-50",
          )}
        >
          {option.preview && (
            <span aria-hidden="true" className="block border-b">
              {option.preview}
            </span>
          )}
          <span className="flex items-start justify-between gap-2 p-3">
            <span className="block">
              <span className="block text-sm font-medium">{option.label}</span>
              {option.description && (
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              )}
            </span>
            <Radio.Indicator className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CheckIcon className="size-3.5" />
            </Radio.Indicator>
          </span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

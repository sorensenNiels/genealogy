import type { ReactNode } from "react";
import {
  RadioButton,
  RadioField,
  RadioGroup as RACRadioGroup,
  type RadioGroupProps as RACRadioGroupProps,
} from "react-aria-components";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export interface ButtonRadioGroupOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface ButtonRadioGroupProps<T extends string> extends Omit<
  RACRadioGroupProps,
  "children" | "value" | "onChange" | "className"
> {
  value: T;
  onChange: (value: T) => void;
  options: ButtonRadioGroupOption<T>[];
  className?: string;
}

const optionClassName = cn(
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none",
  "border-input bg-secondary text-secondary-foreground data-hovered:bg-secondary/80",
  "data-selected:border-primary data-selected:bg-primary data-selected:text-primary-foreground data-selected:data-hovered:bg-primary/90",
  "data-focus-visible:ring-[3px] data-focus-visible:ring-ring/50",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
);

/**
 * A radio group that reads as a row of buttons — the selected option filled
 * like the primary button, the rest like secondary buttons — rather than the
 * usual dot-plus-label radio layout. Built on React Aria's
 * RadioGroup/RadioField/RadioButton (roving tabindex, arrow-key navigation
 * and the radiogroup/radio ARIA roles come for free) instead of a row of
 * plain buttons with hand-rolled aria-pressed/keyboard bookkeeping. Uses
 * RadioField/RadioButton rather than the older `Radio` (react-aria-components
 * deprecated it in favor of this split).
 */
export function ButtonRadioGroup<T extends string>({
  value,
  onChange,
  options,
  className,
  ...props
}: ButtonRadioGroupProps<T>) {
  const isReadOnly = useReadOnly();
  return (
    <RACRadioGroup
      {...(isReadOnly ? { isReadOnly: true } : {})}
      value={value}
      onChange={(next) => onChange(next as T)}
      orientation="horizontal"
      className={cn("flex gap-2", className)}
      {...props}
    >
      {options.map((option) => (
        // `contents` keeps this wrapper out of the flex layout — RadioButton
        // (a label) is the element that should actually size and gap like a
        // button, not this div React Aria requires around it.
        <RadioField key={option.value} value={option.value} className="contents">
          <RadioButton className={optionClassName}>{option.label}</RadioButton>
        </RadioField>
      ))}
    </RACRadioGroup>
  );
}

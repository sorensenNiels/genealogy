import { RadioButton, RadioField, RadioGroup as RACRadioGroup } from "react-aria-components";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export interface ColorSwatchPickerProps {
  "aria-label": string;
  value: string;
  onChange: (value: string) => void;
  colors: string[];
  className?: string;
}

/**
 * A row of colored circles, one selectable at a time — the same
 * RadioGroup/RadioField/RadioButton composition `ButtonRadioGroup` uses, just
 * styled as swatches instead of a row of buttons. Built here rather than
 * inline in a route, per CLAUDE.md's "apps/frontend never imports
 * react-aria-components directly" rule — first used by the new-album
 * dialog's physical-album cover color picker.
 */
export function ColorSwatchPicker({
  "aria-label": ariaLabel,
  value,
  onChange,
  colors,
  className,
}: ColorSwatchPickerProps) {
  const isReadOnly = useReadOnly();
  return (
    <RACRadioGroup
      {...(isReadOnly ? { isReadOnly: true } : {})}
      value={value}
      onChange={onChange}
      orientation="horizontal"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {colors.map((color) => (
        <RadioField key={color} value={color} className="contents">
          {/* `aria-label` on `RadioButton` lands on its wrapping `<label>`, not
              the actual `<input>` it renders — a `<label>`'s own aria-label
              doesn't feed the input's accessible name computation, only the
              label's text content does. A visually-hidden text child is what
              `ButtonRadioGroup`'s own icon-only options already rely on for
              exactly this reason. */}
          <RadioButton
            style={{ background: color }}
            className="size-7 cursor-pointer rounded-full outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-selected:ring-2 data-selected:ring-ring data-selected:ring-offset-2"
          >
            <span className="sr-only">{color}</span>
          </RadioButton>
        </RadioField>
      ))}
    </RACRadioGroup>
  );
}

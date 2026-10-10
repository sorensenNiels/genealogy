import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export interface ColorSwatchPickerProps {
  "aria-label": string;
  value: string;
  onValueChange: (value: string) => void;
  colors: readonly string[];
  className?: string | undefined;
}

/**
 * A row of colored circles, one selectable at a time — the same Base UI
 * RadioGroup/Radio as `ButtonRadioGroup`, styled as swatches. Each swatch
 * is named by its color value (visually hidden) for screen readers.
 */
export function ColorSwatchPicker({
  "aria-label": ariaLabel,
  value,
  onValueChange,
  colors,
  className,
}: ColorSwatchPickerProps) {
  const isReadOnly = useReadOnly();
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      readOnly={isReadOnly}
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {colors.map((color) => (
        <Radio.Root
          key={color}
          value={color}
          style={{ background: color }}
          className="size-7 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring data-checked:ring-2 data-checked:ring-ring data-checked:ring-offset-2"
        >
          <span className="sr-only">{color}</span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

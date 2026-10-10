import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { XIcon } from "lucide-react";
import type { FocusEventHandler, KeyboardEventHandler } from "react";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export interface AutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Offered while typing, narrowed by a case-insensitive "contains" match —
   * the field still accepts anything else typed: a suggestion list, not a
   * closed vocabulary.
   */
  options: readonly string[];
  /**
   * Called when a suggestion is chosen from the list (click, or Enter on a
   * highlighted one). When given, choosing calls only this and leaves the
   * text as it was — for a field that does something with the choice
   * (`TagInput` adds it as a chip) rather than just filling in the text.
   */
  onOptionSelect?: ((option: string) => void) | undefined;
  /** A × inside the field to clear it, shown whenever there's a value. */
  clearable?: boolean | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  placeholder?: string | undefined;
  onBlur?: FocusEventHandler<HTMLInputElement> | undefined;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement> | undefined;
  className?: string | undefined;
}

/**
 * A plain-looking text field with type-ahead suggestions from a small local
 * `options` list — Base UI's `Autocomplete`, which filters them itself and
 * keeps whatever was typed. Unlike `Combobox` (pick one result of a remote
 * search), the value here is the text.
 */
export function Autocomplete({
  value,
  onValueChange,
  options,
  onOptionSelect,
  clearable,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  placeholder,
  onBlur,
  onKeyDown,
  className,
}: AutocompleteProps) {
  const isReadOnly = useReadOnly();
  return (
    <AutocompletePrimitive.Root
      items={options}
      value={value}
      onValueChange={(next, details) => {
        if (details.reason === "item-press" && onOptionSelect) onOptionSelect(next);
        else onValueChange(next);
      }}
      readOnly={isReadOnly}
    >
      <div
        data-slot="autocomplete-input-group"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 md:text-sm dark:bg-input/30",
          className,
        )}
      >
        <AutocompletePrimitive.Input
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          placeholder={placeholder}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 bg-transparent text-inherit outline-none placeholder:text-muted-foreground"
        />
        {clearable && value !== "" && (
          <AutocompletePrimitive.Clear
            aria-label="Clear"
            className="shrink-0 rounded-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </AutocompletePrimitive.Clear>
        )}
      </div>
      <AutocompletePrimitive.Portal>
        <AutocompletePrimitive.Positioner sideOffset={6} align="start" className="isolate z-50">
          <AutocompletePrimitive.Popup className="max-h-60 w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-[empty]:hidden">
            <AutocompletePrimitive.List>
              {(option: string) => (
                <AutocompletePrimitive.Item
                  key={option}
                  value={option}
                  className="flex w-full cursor-default items-center rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {option}
                </AutocompletePrimitive.Item>
              )}
            </AutocompletePrimitive.List>
          </AutocompletePrimitive.Popup>
        </AutocompletePrimitive.Positioner>
      </AutocompletePrimitive.Portal>
    </AutocompletePrimitive.Root>
  );
}

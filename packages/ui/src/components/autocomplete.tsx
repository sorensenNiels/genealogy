import { motion } from "motion/react";
import { useMemo, type ComponentProps } from "react";
import {
  ComboBox as RACComboBox,
  Input as RACInput,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";

import {
  OverlayTransitionProvider,
  useOverlayTransition,
  useOverlayTransitionState,
} from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";

const MotionDiv = motion.create("div");

export interface AutocompleteProps extends Omit<
  ComponentProps<typeof RACInput>,
  "value" | "onChange" | "children"
> {
  value: string;
  onChange: (value: string) => void;
  /**
   * Offered while typing, narrowed by a simple case-insensitive "contains"
   * match — the field still accepts anything else typed, this is a
   * suggestion list, not a closed vocabulary.
   */
  options: readonly string[];
}

/**
 * A plain-looking text field with type-ahead suggestions — unlike `Combobox`
 * (built for a remote-searched picker, with its own search icon and
 * always-true filter), this filters a small local `options` list itself and
 * still commits whatever was typed even if it matches nothing, via
 * `allowsCustomValue`.
 */
export function Autocomplete({ value, onChange, options, className, ...props }: AutocompleteProps) {
  const { contextValue, handleOpenChange } = useOverlayTransition();
  // `items` is a controlled collection as far as RAC is concerned — it
  // doesn't filter it against `inputValue` itself (that's `defaultItems`'
  // job), so the "contains" narrowing happens here instead.
  const query = value.trim().toLowerCase();
  const items = useMemo(
    () =>
      options
        .filter((option) => query === "" || option.toLowerCase().includes(query))
        .map((option) => ({ id: option })),
    [options, query],
  );

  return (
    <RACComboBox
      allowsCustomValue
      menuTrigger="focus"
      inputValue={value}
      onInputChange={onChange}
      items={items}
      onOpenChange={handleOpenChange}
    >
      <OverlayTransitionProvider value={contextValue}>
        <RACInput
          data-slot="autocomplete-input"
          className={cn(
            "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm",
            className,
          )}
          {...props}
        />
        <AutocompleteContent />
      </OverlayTransitionProvider>
    </RACComboBox>
  );
}

function AutocompleteContent() {
  const { animation, onAnimationComplete } = useOverlayTransitionState();
  return (
    <Popover className="w-(--trigger-width)" isExiting={animation === "hidden"}>
      <MotionDiv
        initial="hidden"
        animate={animation === "visible" ? "visible" : "hidden"}
        variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        onAnimationComplete={onAnimationComplete}
      >
        <ListBox<{
          id: string;
        }> className="max-h-60 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden">
          {(item) => (
            <ListBoxItem
              id={item.id}
              textValue={item.id}
              data-slot="autocomplete-item"
              className="relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-focused:bg-accent data-focused:text-accent-foreground"
            >
              {item.id}
            </ListBoxItem>
          )}
        </ListBox>
      </MotionDiv>
    </Popover>
  );
}

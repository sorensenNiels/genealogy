import type { ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";
import {
  Combobox as ComboboxRoot,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "./ui/combobox";

export interface ComboboxProps<T> {
  /** The candidates to show — already filtered (e.g. by a server search keyed off `inputValue`). */
  items: readonly T[];
  /** A stable key per item. */
  itemKey: (item: T) => string;
  /** The item as plain text — typed into the input once picked, and read out by screen readers. */
  itemLabel: (item: T) => string;
  /** How an item looks in the list; defaults to `itemLabel`. */
  renderItem?: ((item: T) => ReactNode) | undefined;
  inputValue: string;
  onInputValueChange: (value: string) => void;
  /** Called with the item the user picks. */
  onSelect: (item: T) => void;
  "aria-label": string;
  placeholder?: string | undefined;
  /** Shown when there are no `items`. */
  emptyText?: ReactNode | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A search box with a list of results to pick one from. Built for a
 * remote-searched list: feed `items` from a query keyed off `inputValue` —
 * there's no client-side filtering on top (Base UI's own filter is off),
 * since the server has already filtered by the time items arrive. For a
 * small fixed list of free-text suggestions, use `Autocomplete`.
 */
export function Combobox<T>({
  items,
  itemKey,
  itemLabel,
  renderItem,
  inputValue,
  onInputValueChange,
  onSelect,
  "aria-label": ariaLabel,
  placeholder,
  emptyText,
  disabled,
  className,
}: ComboboxProps<T>) {
  const isReadOnly = useReadOnly();
  return (
    <ComboboxRoot<T>
      items={items}
      filter={null}
      itemToStringLabel={itemLabel}
      itemToStringValue={itemKey}
      isItemEqualToValue={(item, value) => itemKey(item) === itemKey(value)}
      inputValue={inputValue}
      onInputValueChange={(next) => onInputValueChange(next)}
      onValueChange={(item) => {
        if (item !== null) onSelect(item);
      }}
      disabled={disabled}
      readOnly={isReadOnly}
    >
      <ComboboxInput
        aria-label={ariaLabel}
        placeholder={placeholder}
        showTrigger={false}
        className={cn("w-full", className)}
      />
      <ComboboxContent>
        {emptyText && <ComboboxEmpty>{emptyText}</ComboboxEmpty>}
        <ComboboxList>
          {(item: T) => (
            <ComboboxItem key={itemKey(item)} value={item}>
              {renderItem ? renderItem(item) : itemLabel(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </ComboboxRoot>
  );
}

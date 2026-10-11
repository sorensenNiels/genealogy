import { GripVertical } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import {
  GridList as RACGridList,
  GridListItem as RACGridListItem,
  useDragAndDrop,
  useListData,
  type DropPosition,
} from "react-aria-components";

import { cn } from "../lib/utils";
import { AriaButton } from "./aria/button";

export interface SortableGridProps<T extends { id: string }> {
  "aria-label": string;
  items: T[];
  /** What each item shows — inert while arranging, so a link or button in it can't fire mid-drag. */
  children: (item: T) => ReactNode;
  /** The words for an item, for screen readers announcing what's being moved. */
  textValue: (item: T) => string;
  /** Called with the complete new id order once a drop completes. */
  onReorder: (orderedIds: string[]) => void;
  /** The drag handle's label, e.g. "Move Census gaps". */
  dragLabel: (item: T) => string;
  /** The grid's own classes — its columns and gaps. */
  className?: string;
}

/**
 * `order` with `movedIds` taken out and put back before or after
 * `targetId` — what a drop does to the list. Exported for its tests; a
 * drop "on" an item (not before or after it) leaves the order alone.
 */
export function reorderIds(
  order: readonly string[],
  movedIds: readonly string[],
  targetId: string,
  position: DropPosition,
): string[] {
  if (position === "on" || movedIds.includes(targetId)) return [...order];
  const remaining = order.filter((id) => !movedIds.includes(id));
  const targetIndex = remaining.indexOf(targetId);
  if (targetIndex === -1) return [...order];
  const insertAt = position === "after" ? targetIndex + 1 : targetIndex;
  return [...remaining.slice(0, insertAt), ...movedIds, ...remaining.slice(insertAt)];
}

/**
 * A CSS grid of arbitrary items the member rearranges by dragging — with a
 * mouse or finger anywhere on an item, or from the keyboard via each item's
 * grip handle (Enter, then the arrow keys, then Enter to drop). Built on
 * React Aria's `GridList` drag and drop, like `PhotoGrid`, because Base UI
 * has no equivalent and a hand-rolled one wouldn't announce the moves.
 *
 * Meant for an "arrange" mode: the items are shown `inert`, so dragging a
 * card full of links doesn't follow one, and the handle is the only thing
 * in each item that takes focus.
 */
export function SortableGrid<T extends { id: string }>({
  "aria-label": ariaLabel,
  items,
  children,
  textValue,
  onReorder,
  dragLabel,
  className,
}: SortableGridProps<T>) {
  const list = useListData({ initialItems: items, getKey: (item) => item.id });

  // Follows `items` when the caller's set changes — `useListData` has no
  // "replace all", so empty it and append the new set.
  useEffect(() => {
    list.remove(...list.items.map((item) => item.id));
    list.append(...items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => {
        const item = list.getItem(key);
        return { "text/plain": item ? textValue(item) : String(key) };
      }),
    onReorder(event) {
      const movedIds = [...event.keys].map(String);
      const target = String(event.target.key);
      const next = reorderIds(
        list.items.map((item) => item.id),
        movedIds,
        target,
        event.target.dropPosition,
      );
      if (event.target.dropPosition === "before") list.moveBefore(event.target.key, event.keys);
      else if (event.target.dropPosition === "after") list.moveAfter(event.target.key, event.keys);
      onReorder(next);
    },
  });

  return (
    <RACGridList
      aria-label={ariaLabel}
      layout="grid"
      items={list.items}
      dragAndDropHooks={dragAndDropHooks}
      className={cn("grid gap-4", className)}
    >
      {(item) => (
        <RACGridListItem
          textValue={textValue(item)}
          className={cn(
            "relative cursor-grab rounded-xl outline-none",
            "data-dragging:opacity-40 data-focus-visible:ring-2 data-focus-visible:ring-ring",
            // The drop indicator: a line where the item will land.
            "data-drop-target:ring-2 data-drop-target:ring-primary",
          )}
        >
          <div inert className="h-full select-none">
            {children(item)}
          </div>
          <AriaButton
            slot="drag"
            variant="secondary"
            size="icon"
            className="absolute top-2 right-2 size-8 shadow-sm"
            aria-label={dragLabel(item)}
          >
            <GripVertical className="size-4" />
          </AriaButton>
        </RACGridListItem>
      )}
    </RACGridList>
  );
}

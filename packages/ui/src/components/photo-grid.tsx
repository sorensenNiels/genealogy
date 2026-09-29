import { GripVertical } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import {
  GridList as RACGridList,
  GridListItem as RACGridListItem,
  useDragAndDrop,
  useListData,
  type Key,
  type Selection,
} from "react-aria-components";

export type { Selection };

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";

export interface PhotoGridProps<T extends { id: string }> {
  "aria-label": string;
  items: T[];
  /** Renders one item's thumbnail content (typically just an `<img>`). */
  children: (item: T) => ReactNode;
  selectedKeys: Selection;
  onSelectionChange: (keys: Selection) => void;
  /**
   * Present → drag-and-drop reordering is enabled, and this is called with
   * the *complete* new id order once a drag completes (not a single moved
   * item) — the caller persists the whole sequence in one call. Absent →
   * the grid renders without drag handles at all.
   */
  onReorder?: (orderedIds: string[]) => void;
  /** Fired when an item is pressed while nothing is selected — e.g. open a viewer. */
  onItemAction?: (id: string) => void;
  className?: string;
}

/**
 * A CSS-grid photo thumbnail list with multi-select (checkbox affordance)
 * and, when `onReorder` is given, drag-and-drop manual reordering — built on
 * React Aria's `GridList` (`layout="grid"`) rather than a plain `<div>` grid
 * of buttons, since that can't express selection or drag semantics
 * accessibly. Kept as one `packages/ui` component, per CLAUDE.md's "frontend
 * never imports react-aria-components directly" rule — `apps/frontend` only
 * ever sees `items`/`children`/callbacks, never `useDragAndDrop`/`useListData`
 * themselves.
 *
 * With nothing selected, pressing a thumbnail fires `onItemAction` (open the
 * viewer); the checkbox is the dedicated affordance for selecting instead —
 * this is React Aria's default "toggle" selection behavior, not something
 * this component wires up manually. Once something is selected, pressing any
 * thumbnail toggles its selection instead of opening it, matching how every
 * other photo app's multi-select mode behaves.
 */
export function PhotoGrid<T extends { id: string }>({
  "aria-label": ariaLabel,
  items,
  children,
  selectedKeys,
  onSelectionChange,
  onReorder,
  onItemAction,
  className,
}: PhotoGridProps<T>) {
  const list = useListData({ initialItems: items, getKey: (item) => item.id });

  // Re-sync whenever the server's own item set changes (upload/remove/delete
  // refetch) — `useListData` has no bulk "replace all", so remove everything
  // currently held and re-append the fresh set.
  useEffect(() => {
    list.remove(...list.items.map((item) => item.id));
    list.append(...items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: !onReorder,
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder(event) {
      const movedIds = [...event.keys].map(String);
      const currentOrder = list.items.map((item) => item.id);
      const remaining = currentOrder.filter((id) => !movedIds.includes(id));
      const targetIndex = remaining.indexOf(String(event.target.key));
      const insertAt = event.target.dropPosition === "after" ? targetIndex + 1 : targetIndex;
      const newOrder = [...remaining.slice(0, insertAt), ...movedIds, ...remaining.slice(insertAt)];

      if (event.target.dropPosition === "before") {
        list.moveBefore(event.target.key, event.keys);
      } else if (event.target.dropPosition === "after") {
        list.moveAfter(event.target.key, event.keys);
      }
      onReorder?.(newOrder);
    },
  });

  return (
    <RACGridList
      aria-label={ariaLabel}
      layout="grid"
      selectionMode="multiple"
      items={list.items}
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      {...(onItemAction ? { onAction: (key: Key) => onItemAction(String(key)) } : {})}
      {...(onReorder ? { dragAndDropHooks } : {})}
      className={cn("grid grid-cols-4 gap-1.5 sm:grid-cols-6", className)}
    >
      {(item) => (
        <RACGridListItem
          textValue={item.id}
          className="group relative aspect-square overflow-hidden rounded-md bg-muted outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring"
        >
          {({ allowsDragging }) => (
            <>
              {children(item)}
              {allowsDragging && (
                <Button
                  slot="drag"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 size-6 bg-background/80 backdrop-blur-sm"
                  aria-label="Drag to reorder"
                >
                  <GripVertical className="size-3.5" />
                </Button>
              )}
              <Checkbox
                slot="selection"
                aria-label="Select photo"
                className="absolute top-1 left-1 rounded bg-background/80 p-0.5 backdrop-blur-sm"
              />
            </>
          )}
        </RACGridListItem>
      )}
    </RACGridList>
  );
}

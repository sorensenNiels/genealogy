import { SearchIcon } from "lucide-react";
import { motion } from "motion/react";
import type * as React from "react";
import {
  ComboBox as RACComboBox,
  Group,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  type ComboBoxProps as RACComboBoxProps,
  type ListBoxItemProps,
} from "react-aria-components";

import {
  OverlayTransitionProvider,
  useOverlayTransition,
  useOverlayTransitionState,
} from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";

const MotionDiv = motion.create("div");

/**
 * Built for a remote-searched list: feed `items` from a query keyed off
 * `onInputChange` rather than filtering locally. `defaultFilter={() => true}`
 * turns off React Aria's own client-side "contains" filter, since the server
 * has already filtered by the time these items arrive.
 */
export function Combobox<T extends object>({
  onOpenChange,
  children,
  ...props
}: Omit<RACComboBoxProps<T>, "children" | "onOpenChange"> & {
  children: React.ReactNode;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const { contextValue, handleOpenChange } = useOverlayTransition(onOpenChange);
  return (
    <RACComboBox
      allowsEmptyCollection
      defaultFilter={() => true}
      // There's no separate trigger button here — just the search input —
      // so the default "input" trigger (which needs an actual edit, not just
      // focus) would never open from a plain click/tab into the field.
      menuTrigger="focus"
      {...props}
      onOpenChange={handleOpenChange}
    >
      <OverlayTransitionProvider value={contextValue}>{children}</OverlayTransitionProvider>
    </RACComboBox>
  );
}

export function ComboboxInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Group
      data-slot="combobox-input-group"
      className="flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <Input
        data-slot="combobox-input"
        className={cn(
          "h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </Group>
  );
}

export function ComboboxContent<T extends object>({
  className,
  children,
  renderEmptyState,
}: {
  className?: string;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  renderEmptyState?: () => React.ReactNode;
}) {
  // Unlike Popover/Dialog, this can't unmount while "closed": Combobox needs
  // its item collection discoverable at all times (e.g. so a selected item's
  // label can resolve), even before the popup has ever been opened.
  const { animation, onAnimationComplete } = useOverlayTransitionState();

  // Motion animates a plain `motion.div` nested inside `Popover`, rather than
  // wrapping `Popover` itself with `motion.create()` — see the "Motion +
  // React Aria Popover" note in TECH_STACK.md.
  return (
    <Popover className="w-(--trigger-width)" isExiting={animation === "hidden"}>
      <MotionDiv
        initial="hidden"
        animate={animation === "visible" ? "visible" : "hidden"}
        variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        onAnimationComplete={onAnimationComplete}
      >
        <ListBox
          className={cn(
            "max-h-80 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden",
            className,
          )}
          {...(renderEmptyState ? { renderEmptyState } : {})}
        >
          {children}
        </ListBox>
      </MotionDiv>
    </Popover>
  );
}

export function ComboboxEmpty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function ComboboxItem({ className, children, textValue, ...props }: ListBoxItemProps) {
  const resolvedTextValue = textValue ?? (typeof children === "string" ? children : undefined);
  return (
    <ListBoxItem
      {...props}
      {...(resolvedTextValue !== undefined ? { textValue: resolvedTextValue } : {})}
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-focused:bg-accent data-focused:text-accent-foreground",
        typeof className === "string" ? className : undefined,
      )}
    >
      {children}
    </ListBoxItem>
  );
}

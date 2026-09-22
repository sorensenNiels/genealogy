import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { motion } from "motion/react";
import type * as React from "react";
import {
  Select as RACSelect,
  SelectValue as RACSelectValue,
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  type ListBoxItemProps,
  type SelectProps as RACSelectProps,
} from "react-aria-components";

import {
  OverlayTransitionProvider,
  useOverlayTransition,
  useOverlayTransitionState,
} from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";

const MotionDiv = motion.create("div");

export function Select<T extends object>({
  isOpen,
  onOpenChange,
  children,
  ...props
}: Omit<RACSelectProps<T>, "children" | "onOpenChange"> & {
  children: React.ReactNode;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const { contextValue, handleOpenChange } = useOverlayTransition(isOpen, onOpenChange);
  return (
    <RACSelect
      {...props}
      {...(isOpen !== undefined ? { isOpen } : {})}
      onOpenChange={handleOpenChange}
    >
      <OverlayTransitionProvider value={contextValue}>{children}</OverlayTransitionProvider>
    </RACSelect>
  );
}

export function SelectTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus-visible:border-ring data-focus-visible:ring-[3px] data-focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
    >
      {children}
      <ChevronDownIcon aria-hidden className="size-4 opacity-50" />
    </Button>
  );
}

export function SelectValue<T extends object>(
  props: React.ComponentProps<typeof RACSelectValue<T>>,
) {
  return <RACSelectValue {...props} />;
}

export function SelectContent<T extends object>({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode | ((item: T) => React.ReactNode);
}) {
  // Unlike Popover/Dialog, this can't unmount while "closed": Select needs
  // its item collection discoverable at all times to resolve the current
  // value against a label, even before the popup has ever been opened.
  const { animation, onAnimationComplete } = useOverlayTransitionState();

  // Motion animates a plain `motion.div` nested inside `Popover`, rather than
  // wrapping `Popover` itself with `motion.create()` — see the "Motion +
  // React Aria Popover" note in TECH_STACK.md for why: `Popover` re-renders
  // to recompute its own position (`--trigger-anchor-point`/`--trigger-width`
  // custom properties), and that stomps whatever inline style Motion last
  // wrote for `opacity`/`transform` on the *same* node, leaving it stuck at
  // its `initial` value no matter what `animate` says. A plain div one level
  // in doesn't participate in that positioning re-render, so Motion's writes
  // to it stick.
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
            "scrollbar-thin max-h-80 min-w-32 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden",
            className,
          )}
        >
          {children}
        </ListBox>
      </MotionDiv>
    </Popover>
  );
}

export function SelectItem({ className, children, textValue, ...props }: ListBoxItemProps) {
  const resolvedTextValue = textValue ?? (typeof children === "string" ? children : undefined);
  return (
    <ListBoxItem
      {...props}
      {...(resolvedTextValue !== undefined ? { textValue: resolvedTextValue } : {})}
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-focused:bg-accent data-focused:text-accent-foreground",
        typeof className === "string" ? className : undefined,
      )}
    >
      {(renderProps) => (
        <>
          <span className="absolute right-2 flex size-3.5 items-center justify-center">
            {renderProps.isSelected && <CheckIcon className="size-4" />}
          </span>
          {typeof children === "function" ? children(renderProps) : children}
        </>
      )}
    </ListBoxItem>
  );
}

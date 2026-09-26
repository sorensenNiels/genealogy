import { motion } from "motion/react";
import type * as React from "react";
import {
  Menu as RACMenu,
  MenuItem as RACMenuItem,
  MenuTrigger as RACMenuTrigger,
  Popover,
  type MenuItemProps,
  type MenuTriggerProps,
} from "react-aria-components";

import {
  OverlayTransitionProvider,
  useOverlayTransition,
  useOverlayTransitionState,
} from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";
import { Separator } from "./separator";

const MotionDiv = motion.create("div");

/** The trigger goes directly inside as the first child, the menu itself as the second — same convention as `Dialog`/`Popover`/`Select`. */
export function DropdownMenu({
  isOpen,
  onOpenChange,
  children,
  ...props
}: Omit<MenuTriggerProps, "children" | "onOpenChange"> & {
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const { contextValue, handleOpenChange } = useOverlayTransition(isOpen, onOpenChange);
  return (
    <RACMenuTrigger
      {...props}
      {...(isOpen !== undefined ? { isOpen } : {})}
      onOpenChange={handleOpenChange}
    >
      <OverlayTransitionProvider value={contextValue}>{children}</OverlayTransitionProvider>
    </RACMenuTrigger>
  );
}

export function DropdownMenuContent<T extends object>({
  className,
  /**
   * Rendered above the menu, outside its `role="menu"` element — React
   * Aria's `Menu` only accepts `MenuItem`/`Separator` collection children,
   * so a plain label row (e.g. `DropdownMenuLabel`) has to live here rather
   * than as a menu child, or the whole collection silently renders empty.
   */
  header,
  children,
}: {
  className?: string;
  header?: React.ReactNode;
  children: React.ReactNode | ((item: T) => React.ReactNode);
}) {
  const { animation, onAnimationComplete } = useOverlayTransitionState();
  if (animation === "unmounted") return null;

  // Same reason as SelectContent: Motion animates a plain nested div rather
  // than the Popover itself, since Popover re-renders to recompute its own
  // position and would stomp Motion's inline opacity/transform otherwise.
  return (
    <Popover className="min-w-48" isExiting={animation === "hidden"}>
      <MotionDiv
        initial="hidden"
        animate={animation === "visible" ? "visible" : "hidden"}
        variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        onAnimationComplete={onAnimationComplete}
        className="rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {header}
        <RACMenu className={cn("flex flex-col gap-0.5 outline-hidden", className)}>
          {children}
        </RACMenu>
      </MotionDiv>
    </Popover>
  );
}

export function DropdownMenuItem({ className, ...props }: MenuItemProps) {
  return (
    <RACMenuItem
      {...props}
      className={cn(
        "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-focused:bg-accent data-focused:text-accent-foreground",
        typeof className === "string" ? className : undefined,
      )}
    />
  );
}

/** A small non-interactive header row — e.g. the signed-in user's name/email atop the menu. */
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-sm font-medium", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return <Separator className={cn("-mx-1 my-1 w-auto", className)} {...props} />;
}

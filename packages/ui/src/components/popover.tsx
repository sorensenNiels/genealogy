import { motion } from "motion/react";
import type * as React from "react";
import {
  DialogTrigger,
  Heading,
  Popover as RACPopover,
  Text,
  type DialogTriggerProps,
} from "react-aria-components";

import {
  OverlayTransitionProvider,
  useOverlayTransition,
  useOverlayTransitionState,
} from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";

const MotionPopover = motion.create(RACPopover);

/** The trigger goes directly inside as the first child — no separate Trigger component needed. */
export function Popover({ isOpen, onOpenChange, children, ...props }: DialogTriggerProps) {
  const { contextValue, handleOpenChange } = useOverlayTransition(isOpen, onOpenChange);
  return (
    <DialogTrigger
      {...props}
      {...(isOpen !== undefined ? { isOpen } : {})}
      onOpenChange={handleOpenChange}
    >
      <OverlayTransitionProvider value={contextValue}>{children}</OverlayTransitionProvider>
    </DialogTrigger>
  );
}

export function PopoverContent({
  className,
  offset = 4,
  children,
}: {
  className?: string;
  offset?: number;
  children: React.ReactNode;
}) {
  const { animation, onAnimationComplete } = useOverlayTransitionState();
  if (animation === "unmounted") return null;

  return (
    <MotionPopover
      offset={offset}
      isExiting={animation === "hidden"}
      initial="hidden"
      animate={animation}
      variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
      transition={{ type: "spring", stiffness: 500, damping: 32 }}
      onAnimationComplete={onAnimationComplete}
      className={cn(
        "w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden",
        className,
      )}
    >
      {children}
    </MotionPopover>
  );
}

export function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

export function PopoverTitle({ className, ...props }: React.ComponentProps<typeof Heading>) {
  return (
    <Heading
      slot="title"
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

export function PopoverDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text
      slot="description"
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

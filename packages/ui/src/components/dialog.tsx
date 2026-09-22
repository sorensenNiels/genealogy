import { XIcon } from "lucide-react";
import { motion } from "motion/react";
import type * as React from "react";
import {
  Button,
  Dialog as RACDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  Text,
  type DialogTriggerProps,
} from "react-aria-components";

import {
  OverlayTransitionProvider,
  useOverlayTransition,
  useOverlayTransitionState,
} from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";

const MotionModalOverlay = motion.create(ModalOverlay);
const MotionModal = motion.create(Modal);

export function Dialog({ onOpenChange, children, ...props }: DialogTriggerProps) {
  const { contextValue, handleOpenChange } = useOverlayTransition(onOpenChange);
  return (
    <DialogTrigger {...props} onOpenChange={handleOpenChange}>
      <OverlayTransitionProvider value={contextValue}>{children}</OverlayTransitionProvider>
    </DialogTrigger>
  );
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
}: {
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}) {
  const { animation, onAnimationComplete } = useOverlayTransitionState();
  if (animation === "unmounted") return null;

  return (
    <MotionModalOverlay
      isExiting={animation === "hidden"}
      initial="hidden"
      animate={animation}
      variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
      transition={{ duration: 0.15 }}
      onAnimationComplete={onAnimationComplete}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      {/* Variants propagate down from ModalOverlay's `animate` — Motion's
          child-component convention — so this only needs its own shape. */}
      <MotionModal
        variants={{
          hidden: { opacity: 0, scale: 0.95, y: 8 },
          visible: { opacity: 1, scale: 1, y: 0 },
        }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn(
          "relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none sm:max-w-lg",
          className,
        )}
      >
        <RACDialog className="flex flex-col gap-4 outline-none">
          {children}
          {showCloseButton && (
            <Button
              slot="close"
              data-slot="dialog-close"
              className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity data-disabled:pointer-events-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-offset-2 data-hovered:opacity-100"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          )}
        </RACDialog>
      </MotionModal>
    </MotionModalOverlay>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof Heading>) {
  return (
    <Heading
      slot="title"
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text
      slot="description"
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

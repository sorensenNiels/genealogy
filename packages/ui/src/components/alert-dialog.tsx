import { motion } from "motion/react";
import type * as React from "react";
import {
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
import { Button, type ButtonProps } from "./button";

const MotionModalOverlay = motion.create(ModalOverlay);
const MotionModal = motion.create(Modal);

/**
 * Same trigger/content split as `Dialog`, but for an interruption that
 * requires an explicit choice: no close button, and outside clicks or Escape
 * don't dismiss it — see `AlertDialogContent`.
 */
export function AlertDialog({ onOpenChange, children, ...props }: DialogTriggerProps) {
  const { contextValue, handleOpenChange } = useOverlayTransition(onOpenChange);
  return (
    <DialogTrigger {...props} onOpenChange={handleOpenChange}>
      <OverlayTransitionProvider value={contextValue}>{children}</OverlayTransitionProvider>
    </DialogTrigger>
  );
}

export function AlertDialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { animation, onAnimationComplete } = useOverlayTransitionState();
  if (animation === "unmounted") return null;

  return (
    <MotionModalOverlay
      isExiting={animation === "hidden"}
      isDismissable={false}
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
        isKeyboardDismissDisabled
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
        <RACDialog role="alertdialog" className="outline-none">
          {children}
        </RACDialog>
      </MotionModal>
    </MotionModalOverlay>
  );
}

export function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof Heading>) {
  return (
    <Heading
      slot="title"
      data-slot="alert-dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text
      slot="description"
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Dismisses without confirming — always a plain, non-destructive button. */
export function AlertDialogCancel({ className, variant = "outline", ...props }: ButtonProps) {
  return (
    <Button slot="close" variant={variant} className={cn("mt-2 sm:mt-0", className)} {...props} />
  );
}

/**
 * Confirms and dismisses. `onPress` runs first, so it can start the action
 * that the dialog exists to gate — `slot="close"` closes the dialog
 * independently of what that handler does.
 */
export function AlertDialogAction({ className, variant = "destructive", ...props }: ButtonProps) {
  return <Button slot="close" variant={variant} className={cn(className)} {...props} />;
}

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
  type OverlayAnimationState,
} from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";

const MotionModalOverlay = motion.create(ModalOverlay);
const MotionModal = motion.create(Modal);

/** The Motion/Modal/Dialog shell `DialogContent` and `ControlledDialogContent` both render — split out so the two only differ in how they get their `animation` state (context vs. direct props), not in what they render. */
function DialogSurface({
  animation,
  onAnimationComplete,
  isOpen,
  onOpenChange,
  className,
  children,
  showCloseButton,
}: {
  animation: OverlayAnimationState;
  onAnimationComplete: (state: OverlayAnimationState) => void;
  /** Only `ControlledDialogContent` (no `DialogTrigger` ancestor) needs to pass these through directly. */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton: boolean;
}) {
  if (animation === "unmounted") return null;

  return (
    <MotionModalOverlay
      {...(isOpen !== undefined ? { isOpen } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
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
          "relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg outline-none sm:max-w-lg",
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

export function Dialog({ isOpen, onOpenChange, children, ...props }: DialogTriggerProps) {
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
  return (
    <DialogSurface
      animation={animation}
      onAnimationComplete={onAnimationComplete}
      {...(className !== undefined ? { className } : {})}
      showCloseButton={showCloseButton}
    >
      {children}
    </DialogSurface>
  );
}

/**
 * `DialogContent`, but fully controlled and with no `DialogTrigger`/`Dialog`
 * ancestor — for a dialog opened from something other than an adjacent
 * trigger button (e.g. `photos/-tag-face-dialog.tsx`, opened by pressing a
 * face box that lives on the photo itself). Same visual shell and closing
 * mechanics as `DialogContent`, minus the trigger-based open/close wiring —
 * see `ImageViewer` for the equivalent split applied to the lightbox instead
 * of the form-sized dialog.
 */
export function ControlledDialogContent({
  isOpen,
  onOpenChange,
  className,
  children,
  showCloseButton = true,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}) {
  const {
    contextValue: { animation, onAnimationComplete },
    handleOpenChange,
  } = useOverlayTransition(isOpen, onOpenChange);
  return (
    <DialogSurface
      animation={animation}
      onAnimationComplete={onAnimationComplete}
      isOpen
      onOpenChange={handleOpenChange}
      {...(className !== undefined ? { className } : {})}
      showCloseButton={showCloseButton}
    >
      {children}
    </DialogSurface>
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

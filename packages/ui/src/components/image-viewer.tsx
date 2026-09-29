import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Button, Dialog as RACDialog, Heading, Modal, ModalOverlay } from "react-aria-components";

import { useOverlayTransition } from "../hooks/use-overlay-transition";
import { cn } from "../lib/utils";

const MotionModalOverlay = motion.create(ModalOverlay);
const MotionModal = motion.create(Modal);

const CONTROL_BUTTON_CLASS =
  "rounded-full bg-black/50 p-2 text-white outline-none transition-colors data-hovered:bg-black/70 data-focus-visible:ring-2 data-focus-visible:ring-white data-disabled:pointer-events-none data-disabled:opacity-40";

export interface ImageViewerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title?: ReactNode;
  caption?: ReactNode;
  /** Omitted (rather than disabled) hides the arrow entirely — there's nothing to go back/forward to. */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Controls below the image — e.g. the tag-face actions in `AssetViewer`. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A full-viewport image lightbox, built directly on RAC `Modal`/`Dialog`
 * rather than reusing this package's own `DialogContent` — see that file's
 * own comment: it's sized and padded for a form (`max-w-lg`, `p-6`), not a
 * near-full-viewport photo. Fully controlled (`isOpen`/`onOpenChange`)
 * instead of a trigger + content split like `Dialog`: callers open this from
 * pressing a thumbnail that lives elsewhere on the page, not from a button
 * that sits directly next to the overlay the way a typical dialog trigger does.
 */
export function ImageViewer({
  isOpen,
  onOpenChange,
  title,
  caption,
  onPrevious,
  onNext,
  footer,
  children,
}: ImageViewerProps) {
  const {
    contextValue: { animation, onAnimationComplete },
    handleOpenChange,
  } = useOverlayTransition(isOpen, onOpenChange);
  if (animation === "unmounted") return null;

  return (
    <MotionModalOverlay
      isOpen
      onOpenChange={handleOpenChange}
      isExiting={animation === "hidden"}
      initial="hidden"
      animate={animation}
      variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
      transition={{ duration: 0.15 }}
      onAnimationComplete={onAnimationComplete}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <MotionModal
        variants={{ hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1 } }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className="relative max-h-[90vh] max-w-[95vw] outline-none"
      >
        <RACDialog className="flex max-h-[90vh] flex-col items-center gap-3 outline-none">
          {title && (
            <Heading slot="title" className="text-sm font-medium text-white">
              {title}
            </Heading>
          )}
          <div className="flex items-center gap-3">
            {onPrevious && (
              <Button
                onPress={onPrevious}
                aria-label="Previous photo"
                className={CONTROL_BUTTON_CLASS}
              >
                <ChevronLeftIcon className="size-5" />
              </Button>
            )}
            <div className="max-h-[70vh] max-w-[80vw] overflow-auto">{children}</div>
            {onNext && (
              <Button onPress={onNext} aria-label="Next photo" className={CONTROL_BUTTON_CLASS}>
                <ChevronRightIcon className="size-5" />
              </Button>
            )}
          </div>
          {caption && <p className="text-xs text-white/70">{caption}</p>}
          {footer}
          <Button
            slot="close"
            aria-label="Close"
            className={cn(CONTROL_BUTTON_CLASS, "absolute -top-12 right-0")}
          >
            <XIcon className="size-5" />
          </Button>
        </RACDialog>
      </MotionModal>
    </MotionModalOverlay>
  );
}

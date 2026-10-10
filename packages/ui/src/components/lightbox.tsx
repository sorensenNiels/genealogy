import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/utils";
import {
  Dialog as DialogRoot,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "./ui/dialog";

const CONTROL_BUTTON_CLASS =
  "rounded-full bg-black/50 p-2 text-white outline-none transition-colors hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-40";

export interface LightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode | undefined;
  /** Width of the content column, e.g. `max-w-4xl`; defaults to fitting the content. */
  className?: string | undefined;
  children: ReactNode;
}

/**
 * The near-full-viewport dark overlay that photos are viewed in — `ImageViewer`
 * and `PhotoBook` both sit in one. A modal dialog like `Dialog`, but not
 * sized or padded for a form: a title row with the close button, then
 * whatever the viewer puts under it. Always controlled; it's opened by
 * clicking a thumbnail elsewhere on the page, not by an adjacent trigger.
 */
export function Lightbox({ open, onOpenChange, title, className, children }: LightboxProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/90 supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 outline-none sm:w-auto",
            "duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            className,
          )}
        >
          <div className="flex w-full items-center justify-between gap-3 text-white">
            <DialogTitle className="truncate text-sm font-medium text-white">{title}</DialogTitle>
            <DialogClose aria-label="Close" className={CONTROL_BUTTON_CLASS}>
              <XIcon className="size-5" />
            </DialogClose>
          </div>
          {children}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogRoot>
  );
}

/** A round control on the dark backdrop — previous/next, page turning. Needs an `aria-label`. */
export function LightboxButton({ className, ...props }: ComponentProps<"button">) {
  return <button type="button" className={cn(CONTROL_BUTTON_CLASS, className)} {...props} />;
}

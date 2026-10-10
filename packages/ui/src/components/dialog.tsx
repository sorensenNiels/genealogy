import { useState, type ReactElement, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button, type ButtonProps } from "./button";
import {
  Dialog as DialogRoot,
  DialogClose as DialogClosePrimitive,
  DialogContent,
  DialogDescription,
  DialogFooter as DialogFooterPrimitive,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

export interface DialogProps {
  title: ReactNode;
  description?: ReactNode | undefined;
  /**
   * The element that opens it — a `Button`, `IconButton`, or a `Tooltip`
   * around one. Leave out for a dialog opened from elsewhere (a face box on
   * a photo, a menu item), and control it with `open`/`onOpenChange`.
   */
  trigger?: ReactElement | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /**
   * The body. As a function it gets `close` — call it when a form inside
   * has finished, instead of tracking the open state yourself.
   */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Wider than the form default, e.g. `sm:max-w-2xl`. */
  className?: string | undefined;
  /** The × in the corner; on by default. */
  showCloseButton?: boolean | undefined;
}

/**
 * Every dialog in the app: title (and optional description) in the header,
 * then the body. One component whether it opens from an adjacent trigger
 * or from state the page owns — `open`/`onOpenChange` make it controlled,
 * otherwise it tracks its own state, and `close` reaches the body either
 * way. Sized for a form (`sm:max-w-lg`) unless `className` says otherwise.
 */
export function Dialog({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  children,
  className,
  showCloseButton = true,
}: DialogProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <DialogRoot open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg", className)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </DialogContent>
    </DialogRoot>
  );
}

/** The action row at the bottom of a dialog: buttons right-aligned, stacked on a phone. */
export function DialogFooter({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  return <DialogFooterPrimitive className={className}>{children}</DialogFooterPrimitive>;
}

/** A button that closes the dialog it's in — "Cancel", "Done". Outline unless told otherwise. */
export function DialogClose({ variant = "outline", ...props }: ButtonProps) {
  return <DialogClosePrimitive render={<Button variant={variant} {...props} />} />;
}

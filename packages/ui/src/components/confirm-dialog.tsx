import { useState, type ReactElement, type ReactNode } from "react";

import { Button } from "./button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

export interface ConfirmDialogProps {
  title: ReactNode;
  description?: ReactNode | undefined;
  /** The element that opens it; leave out and use `open`/`onOpenChange` to open it from state. */
  trigger?: ReactElement | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Runs when confirmed; the dialog closes either way. */
  onConfirm: () => void;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  /** Styles the confirming button as destructive — on by default, since that's what usually needs confirming. */
  destructive?: boolean | undefined;
}

/**
 * Asks before doing something: a title, what it means, Cancel and a
 * confirming button. An alert dialog — a click outside doesn't dismiss it,
 * the user has to choose (Escape still means Cancel).
 */
export function ConfirmDialog({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
}: ConfirmDialogProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

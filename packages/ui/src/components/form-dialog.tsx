import type { ReactNode } from "react";
import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";

export interface FormDialogProps {
  /** The element that opens the dialog — a button, icon button, or a Tooltip wrapping one. */
  trigger: ReactNode;
  title: ReactNode;
  /**
   * Renders the form, given a `close` callback — call it (typically from the
   * form's `onDone`, alongside a refetch) once the form has finished, instead
   * of managing the open/closed state yourself.
   */
  children: (close: () => void) => ReactNode;
  /**
   * Notified on every open/close, in addition to the dialog's own state —
   * for a form with its own sub-mode (e.g. "search" vs "create a new
   * person") that needs resetting back to its default the moment the
   * dialog closes, however it closed.
   */
  onOpenChange?: (isOpen: boolean) => void;
}

/** Owns the open/close state around a trigger + form, for every "Add/Edit X" dialog in the app. */
export function FormDialog({ trigger, title, children, onOpenChange }: FormDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children(() => handleOpenChange(false))}
      </DialogContent>
    </Dialog>
  );
}

import type { ReactElement, ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { Dialog } from "./dialog";

export interface FormDialogProps {
  /** The element that opens the dialog — a `Button`, `IconButton`, or a `Tooltip` around one. */
  trigger: ReactElement;
  title: ReactNode;
  /**
   * Renders the form, given a `close` callback — call it (typically from the
   * form's `onDone`, alongside a refetch) once the form has finished, instead
   * of managing the open/closed state yourself.
   */
  children: (close: () => void) => ReactNode;
  /**
   * Notified on every open/close — for a form with its own sub-mode (e.g.
   * "search" vs "create a new person") that needs resetting the moment the
   * dialog closes, however it closed.
   */
  onOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}

/**
 * Every "Add/Edit X" dialog in the app: a `Dialog` with a trigger, whose
 * body is a form given `close`. Not rendered at all for a read-only member —
 * every one of these edits something.
 */
export function FormDialog({ trigger, title, children, onOpenChange, className }: FormDialogProps) {
  const isReadOnly = useReadOnly();
  if (isReadOnly) return null;
  return (
    <Dialog trigger={trigger} title={title} onOpenChange={onOpenChange} className={className}>
      {children}
    </Dialog>
  );
}

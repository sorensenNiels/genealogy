import type { ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";

/** A "Remove"/"Delete" button that requires an explicit confirmation before it acts. */
export function RemoveButton({
  itemLabel,
  onConfirm,
  trigger,
  title,
  description = "This cannot be undone.",
  actionLabel = "Remove",
}: {
  itemLabel: string;
  onConfirm: () => void;
  /** Defaults to a plain "Remove" text button. */
  trigger?: ReactNode;
  /** Defaults to `Remove {itemLabel}?`. */
  title?: string;
  description?: ReactNode;
  /** The confirming action's own label — defaults to "Remove", e.g. "Delete" reads better for a person record. */
  actionLabel?: string;
}) {
  const isReadOnly = useReadOnly();
  if (isReadOnly) return null;
  return (
    <AlertDialog>
      {trigger ?? (
        <Button type="button" variant="ghost" size="sm">
          Remove
        </Button>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? `Remove ${itemLabel}?`}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onPress={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

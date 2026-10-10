import type { ReactElement, ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

export interface RemoveButtonProps {
  itemLabel: string;
  onConfirm: () => void;
  /** Defaults to a plain "Remove" text button. */
  trigger?: ReactElement | undefined;
  /** Defaults to `Remove {itemLabel}?`. */
  title?: string | undefined;
  description?: ReactNode | undefined;
  /** The confirming action's own label — defaults to "Remove", e.g. "Delete" reads better for a person record. */
  actionLabel?: string | undefined;
}

/** A "Remove"/"Delete" button that requires an explicit confirmation before it acts. Hidden for a read-only member. */
export function RemoveButton({
  itemLabel,
  onConfirm,
  trigger,
  title,
  description = "This cannot be undone.",
  actionLabel = "Remove",
}: RemoveButtonProps) {
  const isReadOnly = useReadOnly();
  if (isReadOnly) return null;
  return (
    <ConfirmDialog
      trigger={
        trigger ?? (
          <Button variant="ghost" size="sm">
            Remove
          </Button>
        )
      }
      title={title ?? `Remove ${itemLabel}?`}
      description={description}
      confirmLabel={actionLabel}
      onConfirm={onConfirm}
    />
  );
}

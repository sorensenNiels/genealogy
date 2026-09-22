import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "./button";

export interface SaveButtonProps extends Omit<ButtonProps, "type" | "isDisabled" | "children"> {
  /** Whether the form has unsaved changes, shown as a small red dot. */
  isDirty: boolean;
  /** Whether the save is in flight — replaces the dot with a spinner and disables the button. */
  isPending: boolean;
  /** An extra reason to disable the button beyond `isPending`, e.g. a required field left blank. */
  isDisabled?: boolean;
  children: ReactNode;
}

/**
 * The submit button for any form that saves or creates a record: a small red
 * dot appears once the form is dirty, and turns into a spinner while the
 * save is in flight. One shared component so every Save/Add button in the
 * app behaves identically — see "Save buttons" in CLAUDE.md.
 *
 * Not for actions without a clean/dirty baseline to compare against (sign
 * in, sign up) — those are plain `Button`s.
 */
export function SaveButton({
  isDirty,
  isPending,
  isDisabled = false,
  children,
  ...props
}: SaveButtonProps) {
  return (
    <Button type="submit" isDisabled={isPending || isDisabled} aria-busy={isPending} {...props}>
      {children}
      {/* aria-hidden: a descendant's aria-label would otherwise merge into
          the button's own accessible name ("Save" becomes "Save Unsaved
          changes") — the dot/spinner are a sighted-only affordance;
          aria-busy above already carries the pending state to assistive
          tech. */}
      {isPending ? (
        <Loader2Icon className="size-3 shrink-0 animate-spin text-destructive" aria-hidden="true" />
      ) : (
        isDirty && (
          <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
        )
      )}
    </Button>
  );
}

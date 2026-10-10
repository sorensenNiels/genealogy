import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { useReadOnly } from "../lib/read-only";
import { Button, type ButtonProps } from "./button";

export interface SaveButtonProps extends Omit<ButtonProps, "disabled" | "children"> {
  /** Whether the form has unsaved changes, shown as a small red dot. */
  isDirty: boolean;
  /** Whether the save is in flight — replaces the dot with a spinner and disables the button. */
  isPending: boolean;
  /** An extra reason to disable the button beyond `isPending`, e.g. a required field left blank. */
  disabled?: boolean;
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
 *
 * `type` defaults to "submit" (the common case: a `<form onSubmit>` calling
 * its own save logic) but can be overridden to "button" for a form embedded
 * inside another one's DOM subtree, driving `submit()` from `onClick`
 * instead. A `type="submit"` button submits its nearest ancestor `<form>`
 * regardless of how deeply it's nested inside other elements — including,
 * for React specifically, across a `createPortal` boundary, since React's
 * synthetic events bubble through the *React tree* (parent/child component
 * relationships), not the DOM tree a portal actually renders into. A stray
 * submit button one dialog below another one's own form was exactly this
 * bug, caught building the event-citation dialog: `Add` in the inner form
 * silently re-triggered the outer form's own submit handler too.
 */
export function SaveButton({
  isDirty,
  isPending,
  disabled = false,
  children,
  type = "submit",
  ...props
}: SaveButtonProps) {
  const isReadOnly = useReadOnly();
  // Nothing to save where nothing can be edited.
  if (isReadOnly) return null;
  return (
    <Button type={type} disabled={isPending || disabled} aria-busy={isPending} {...props}>
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

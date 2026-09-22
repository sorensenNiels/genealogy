import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type OverlayAnimationState = "unmounted" | "hidden" | "visible";

export interface OverlayTransitionContextValue {
  animation: OverlayAnimationState;
  onAnimationComplete: (state: OverlayAnimationState) => void;
}

const OverlayTransitionContext = createContext<OverlayTransitionContextValue | null>(null);

export const OverlayTransitionProvider = OverlayTransitionContext.Provider;

/**
 * Reads the animation state the matching trigger-side `useOverlayTransition`
 * call set up, so a Content component can drive Motion's `animate`/
 * `isExiting` props from it. Must be rendered inside that trigger's
 * `OverlayTransitionProvider` — see popover.tsx/dialog.tsx/select.tsx/
 * combobox.tsx for the pairing.
 */
export function useOverlayTransitionState(): OverlayTransitionContextValue {
  const ctx = useContext(OverlayTransitionContext);
  if (!ctx) {
    throw new Error("Overlay content rendered outside its matching trigger component.");
  }
  return ctx;
}

/**
 * React Aria's documented pattern for animating an overlay's exit with
 * Motion (see the "Animation" section of the styling guide): the overlay
 * component (`Modal`/`Popover`) takes an `isExiting` prop that keeps it
 * mounted until the exit animation finishes, but only the *trigger* —
 * `DialogTrigger`, or `Select`/`ComboBox`'s own `onOpenChange` — knows when
 * the user asked to close it. This hook lives on the trigger side and hands
 * the resulting state down to the matching Content component via context, so
 * the state machine is written once instead of once per component, and
 * consumers of `Popover`/`Dialog`/`Select`/`Combobox` never see it at all.
 */
export function useOverlayTransition(isOpen?: boolean, onOpenChange?: (isOpen: boolean) => void) {
  const [animation, setAnimation] = useState<OverlayAnimationState>(
    isOpen ? "visible" : "unmounted",
  );

  const handleOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      setAnimation(nextIsOpen ? "visible" : "hidden");
      onOpenChange?.(nextIsOpen);
    },
    [onOpenChange],
  );

  // For a *controlled* trigger (`isOpen` passed by the caller, e.g. a Save
  // handler that closes the dialog itself once its mutation succeeds),
  // `isOpen` can change without ever going through `handleOpenChange` above —
  // that callback only fires for changes React Aria itself initiates
  // (pressing the trigger, Escape, an outside click). Without this effect,
  // `animation` would get stuck at "visible" after such a close: React
  // Aria's own trigger sees the real, now-false `isOpen` and tears itself
  // down, but this hook's `animation` state — which is what actually gates
  // whether Content renders the Modal/Popover at all — never leaves
  // "visible", so the next open reactivates an instance RAC already
  // considers closed instead of mounting a fresh one, corrupting its
  // internal focus-trap/overlay-stack bookkeeping.
  useEffect(() => {
    if (isOpen === undefined) return;
    // Syncing to a prop from a controlling parent is exactly the "external
    // system" this rule expects an effect for — `animation` can't be derived
    // during render because it also depends on the exit-animation-complete
    // callback below, and it can't be set from the event that changed
    // `isOpen` because that event happens in a different component (or
    // isn't an event at all — see the comment above).
    // eslint-disable-next-line react/set-state-in-effect
    setAnimation((current) => {
      if (isOpen) return current === "unmounted" ? "visible" : current;
      return current === "visible" ? "hidden" : current;
    });
  }, [isOpen]);

  const handleAnimationComplete = useCallback((state: OverlayAnimationState) => {
    setAnimation((current) => (state === "hidden" && current === "hidden" ? "unmounted" : current));
  }, []);

  return {
    isMounted: animation !== "unmounted",
    handleOpenChange,
    contextValue: {
      animation,
      onAnimationComplete: handleAnimationComplete,
    } satisfies OverlayTransitionContextValue,
  };
}

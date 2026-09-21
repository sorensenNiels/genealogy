import { createContext, useCallback, useContext, useState } from "react";

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
export function useOverlayTransition(onOpenChange?: (isOpen: boolean) => void) {
  const [animation, setAnimation] = useState<OverlayAnimationState>("unmounted");

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setAnimation(isOpen ? "visible" : "hidden");
      onOpenChange?.(isOpen);
    },
    [onOpenChange],
  );

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

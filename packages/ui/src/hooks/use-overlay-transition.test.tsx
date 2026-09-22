import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useOverlayTransition } from "./use-overlay-transition";

describe("useOverlayTransition", () => {
  // A controlled trigger (Dialog/Popover/Select/AlertDialog's `isOpen` prop)
  // can close without ever calling the `onOpenChange` this hook hands to
  // React Aria — e.g. NameForm's onDone calls its own `setEditOpen(false)`
  // directly once a save succeeds, rather than dismissing through React
  // Aria's own trigger/Escape/backdrop path. `animation` used to only ever
  // change inside `handleOpenChange`, so that kind of close left it stuck at
  // "visible" forever: React Aria's own trigger sees the real, now-false
  // `isOpen` and closes, but this hook — which is what actually gates
  // whether Content mounts the Modal/Popover at all — never followed,
  // reactivating an instance React Aria already considered closed on the
  // next open instead of mounting a fresh one.
  it("advances to hidden, then unmounted, when isOpen turns false without onOpenChange", () => {
    const { result, rerender } = renderHook(({ isOpen }) => useOverlayTransition(isOpen), {
      initialProps: { isOpen: false },
    });
    expect(result.current.contextValue.animation).toBe("unmounted");

    rerender({ isOpen: true });
    expect(result.current.contextValue.animation).toBe("visible");

    // The close: only the controlled prop changes, `handleOpenChange` is
    // never called.
    rerender({ isOpen: false });
    expect(result.current.contextValue.animation).toBe("hidden");

    act(() => result.current.contextValue.onAnimationComplete("hidden"));
    expect(result.current.contextValue.animation).toBe("unmounted");

    // Reopening now mounts a clean instance rather than reactivating one
    // React Aria's own trigger already tore down.
    rerender({ isOpen: true });
    expect(result.current.contextValue.animation).toBe("visible");
  });
});

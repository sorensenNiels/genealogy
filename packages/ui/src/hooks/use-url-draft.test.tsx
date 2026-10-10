import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUrlDraft } from "./use-url-draft";

function setup(initial: string, normalize?: (text: string) => string) {
  const commit = vi.fn<(next: string) => void>();
  const hook = renderHook(({ value }) => useUrlDraft(value, commit, normalize), {
    initialProps: { value: initial },
  });
  const type = (text: string) => act(() => hook.result.current[1](text));
  return { hook, commit, type };
}

describe("useUrlDraft", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("commits typing after a pause, not on every keystroke", () => {
    const { hook, commit, type } = setup("");
    type("S");
    type("Sø");
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledExactlyOnceWith("Sø");
    expect(hook.result.current[0]).toBe("Sø");
  });

  it("takes a change from outside, like Back or Reset", () => {
    const { hook } = setup("Jensen");
    hook.rerender({ value: "" });
    expect(hook.result.current[0]).toBe("");
  });

  it("keeps what was typed after a commit when that commit comes back", () => {
    const { hook, type } = setup("");
    type("Sø");
    act(() => vi.advanceTimersByTime(300));
    // Typed on before the URL caught up…
    type("Søren");
    // …then the committed "Sø" arrives: the field must not jump back.
    hook.rerender({ value: "Sø" });
    expect(hook.result.current[0]).toBe("Søren");
  });

  it("sends the normalized text, and doesn't commit a trailing space alone", () => {
    const { commit, type } = setup("Søren", (text) => text.trim());
    type("Søren ");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
    type("Søren J ");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledExactlyOnceWith("Søren J");
  });
});

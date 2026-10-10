import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { optimisticMutationOptions } from "./optimistic";

type Note = { id: string; resolved: boolean };
const KEY = ["researchNote", "listNotes", "p1"];

function setup(mutationFn: (variables: { id: string }) => Promise<void>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<Note[]>(KEY, [
    { id: "a", resolved: false },
    { id: "b", resolved: false },
  ]);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const observer = new MutationObserver(
    queryClient,
    optimisticMutationOptions(queryClient, {
      mutationFn,
      queryKey: KEY,
      update: (notes: Note[], { id }) =>
        notes.map((note) => (note.id === id ? { ...note, resolved: true } : note)),
    }),
  );
  return { queryClient, observer, invalidate };
}

describe("optimisticMutationOptions", () => {
  it("changes the cache before the server answers, and refetches once it has", async () => {
    let finish!: () => void;
    const { queryClient, observer, invalidate } = setup(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    const done = observer.mutate({ id: "a" });
    await vi.waitFor(() => expect(queryClient.getQueryData<Note[]>(KEY)?.[0]?.resolved).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();

    finish();
    await done;
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("puts the cache back as it was when the server refuses", async () => {
    const { queryClient, observer, invalidate } = setup(() =>
      Promise.reject(new Error("Not allowed")),
    );
    const before = queryClient.getQueryData<Note[]>(KEY);

    await expect(observer.mutate({ id: "a" })).rejects.toThrow("Not allowed");
    expect(queryClient.getQueryData<Note[]>(KEY)).toStrictEqual(before);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });
});

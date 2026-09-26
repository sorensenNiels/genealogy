import { useStore } from "@tanstack/react-form";

/** The `isDirty`/`isSubmitting` pair every `SaveButton` call site reads off its TanStack Form instance. */
export function useFormDirtyPending<
  TState extends { isDirty: boolean; isSubmitting: boolean },
>(form: {
  store: {
    get: () => TState;
    subscribe: (listener: (value: TState) => void) => { unsubscribe: () => void };
  };
}): { isDirty: boolean; isSubmitting: boolean } {
  const isDirty = useStore(form.store, (state) => state.isDirty);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  return { isDirty, isSubmitting };
}

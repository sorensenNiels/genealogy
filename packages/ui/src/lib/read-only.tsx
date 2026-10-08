import { createContext, useContext, type ReactNode } from "react";

/**
 * A subtree where nothing can be edited — set by the app for a member who
 * may only read (a Viewer). Form components read it rather than every call
 * site threading an `isReadOnly` prop through: fields turn read-only, and the
 * pure edit affordances (`SaveButton`, `RemoveButton`, `FormDialog`'s
 * trigger) don't render at all. It's presentation only — the backend refuses
 * the writes regardless (see `editorProcedure`).
 */
const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({
  readOnly = true,
  children,
}: {
  readOnly?: boolean;
  children: ReactNode;
}) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

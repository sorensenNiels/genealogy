import type { AppRouter } from "@genealogy/backend";
import type { inferRouterOutputs } from "@trpc/server";

/**
 * The one place every person-detail card gets its row types from — each was
 * previously redeclared at the top of the old, single `$personId.tsx` file.
 * Kept as inferred `AppRouter` output shapes, never hand-written, same as
 * everywhere else in this app.
 */
type RouterOutputs = inferRouterOutputs<AppRouter>;

export type PersonRow = RouterOutputs["person"]["byId"];
export type ParentRow = RouterOutputs["person"]["relatives"]["parents"][number];
export type NameVariantRow = RouterOutputs["person"]["listNames"][number];
export type PersonEventRow = RouterOutputs["person"]["listEvents"][number];
export type UnionRow = RouterOutputs["person"]["listUnions"][number];
export type SourceRow = RouterOutputs["source"]["listSources"][number];
export type CitationRow = RouterOutputs["source"]["listCitations"][number];
export type ResearchNoteRow = RouterOutputs["researchNote"]["listNotes"][number];
export type ConfigurableOptionRow = RouterOutputs["settings"]["listOptions"][number];
export type AssociationRow = RouterOutputs["association"]["list"]["own"][number];
export type AssociationAppearanceRow = RouterOutputs["association"]["list"]["appearances"][number];

import type { AlbumKind } from "@genealogy/core";

/**
 * Single source of truth for "which add-photo action is legal for this
 * album kind" — physical albums only grow via upload (scanned pages),
 * virtual albums only grow by referencing photos already in a physical
 * album. The backend enforces the same rule (`ImmichService.addAssetsToAlbum`/
 * `uploadAsset`); this just keeps `$albumId.tsx`'s toolbar from repeating the
 * same `kind === "physical" ? ... : ...` in more than one place.
 */
export function albumActionsForKind(kind: AlbumKind): {
  canUpload: boolean;
  canAddExisting: boolean;
} {
  return { canUpload: kind === "physical", canAddExisting: kind === "virtual" };
}

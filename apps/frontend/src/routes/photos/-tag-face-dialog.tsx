import { Button } from "@genealogy/ui/components/button";
import { Dialog, DialogFooter } from "@genealogy/ui/components/dialog";
import { Input } from "@genealogy/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PersonPicker } from "../-person-picker";
import { usePersonName } from "../../lib/person-name";
import { linkImmichPerson, tagImmichFace } from "../../server/functions/immich.functions";
import { ImmichPersonPicker } from "../people/-immich-person-picker";

export interface TagFaceTarget {
  id: string;
  immichPerson: { id: string; name: string } | null;
}

/**
 * Assigns a detected face (from `AssetViewer`) to a genealogy person.
 * Controlled, no trigger — opened by clicking a face box that lives on the
 * photo itself, not from a button next to this dialog — so it's a
 * controlled `Dialog` (`open`/`onOpenChange`, no `trigger`) rather than a
 * `FormDialog`.
 *
 * Two paths, matching Immich's own model (most detected faces already
 * belong to *some* Immich person — a brand-new, `person: null` face is the
 * rare case, not the common one):
 * - `face.immichPerson` set: no Immich write needed beyond the existing
 *   `link` call once a genealogy person is picked.
 * - `face.immichPerson` null: also needs an Immich person — either an
 *   existing cluster (picked via `ImmichPersonPicker`, which doubles as
 *   letting the user resolve the "this genealogy person already has
 *   several linked clusters" case by simply choosing the right one) or a
 *   brand-new one, via `tagFace`.
 */
export function TagFaceDialog({
  isOpen,
  onOpenChange,
  face,
  onTagged,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  face: TagFaceTarget;
  onTagged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange} title={t("tagFace.identifyThisFace")}>
      <TagFaceForm
        face={face}
        onDone={async () => {
          onOpenChange(false);
          await onTagged();
        }}
      />
    </Dialog>
  );
}

function TagFaceForm({ face, onDone }: { face: TagFaceTarget; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const linkMutation = useMutation({ mutationFn: linkImmichPerson });
  const tagFaceMutation = useMutation({ mutationFn: tagImmichFace });

  const confirmExistingImmichPerson = async (immichPersonId: string): Promise<void> => {
    if (!personId) return;
    setError(null);
    try {
      // This branch only runs when `face.immichPerson` is null — the face
      // isn't in any Immich cluster yet, so a plain `link` (which only
      // records the genealogy-person/Immich-person association, not the
      // face itself) would leave the face untagged in Immich. `tagFace`
      // does the `PUT /faces` reassignment first, then links.
      await tagFaceMutation.mutateAsync({ data: { faceId: face.id, personId, immichPersonId } });
      await onDone();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : t("tagFace.couldNotTagFace"),
      );
    }
  };

  const confirmKnownFace = async (): Promise<void> => {
    if (!personId || !face.immichPerson) return;
    setError(null);
    try {
      await linkMutation.mutateAsync({ data: { personId, immichPersonId: face.immichPerson.id } });
      await onDone();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : t("tagFace.couldNotTagFace"),
      );
    }
  };

  const confirmNewImmichPerson = async (): Promise<void> => {
    if (!personId || newName.trim() === "") return;
    setError(null);
    try {
      await tagFaceMutation.mutateAsync({
        data: { faceId: face.id, personId, newImmichPersonName: newName.trim() },
      });
      await onDone();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : t("tagFace.couldNotTagFace"),
      );
    }
  };

  const isPending = linkMutation.isPending || tagFaceMutation.isPending;

  if (personId === null) {
    return (
      <PersonPicker
        placeholder={t("tagFace.whoseFaceIsThis")}
        onSelect={(person) => {
          setPersonId(person.id);
          setPersonName(formatName(person));
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("tagFace.taggingAs")} <span className="font-medium text-foreground">{personName}</span>
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {face.immichPerson ? (
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => setPersonId(null)}>
            {t("tagFace.back")}
          </Button>
          <Button disabled={isPending} onClick={() => void confirmKnownFace()}>
            {t("tagFace.confirm")}
          </Button>
        </DialogFooter>
      ) : (
        <>
          <div className="flex gap-1 rounded-md border p-1">
            <Button
              variant={mode === "existing" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("existing")}
            >
              {t("tagFace.existingPerson")}
            </Button>
            <Button
              variant={mode === "new" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("new")}
            >
              {t("tagFace.newPerson")}
            </Button>
          </div>
          {mode === "existing" ? (
            <ImmichPersonPicker
              isDisabled={isPending}
              onPick={(immichPersonId) => void confirmExistingImmichPerson(immichPersonId)}
            />
          ) : (
            <>
              <Input
                placeholder={t("tagFace.newImmichPersonNamePlaceholder")}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" disabled={isPending} onClick={() => setPersonId(null)}>
                  {t("tagFace.back")}
                </Button>
                <Button
                  disabled={isPending || newName.trim() === ""}
                  onClick={() => void confirmNewImmichPerson()}
                >
                  {t("tagFace.confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { formatLifespan, formatPersonName } from "@genealogy/core";
import { Button } from "@genealogy/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import {
  ControlledDialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@genealogy/ui/components/dialog";
import { Input } from "@genealogy/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { linkImmichPerson, tagImmichFace } from "../../server/functions/immich.functions";
import { listPersons } from "../../server/functions/person.functions";
import { ImmichPersonPicker } from "../people/-immich-person-picker";

type PersonSearchResult = Awaited<ReturnType<typeof listPersons>>["items"][number];

export interface TagFaceTarget {
  id: string;
  immichPerson: { id: string; name: string } | null;
}

/**
 * Assigns a detected face (from `AssetViewer`) to a genealogy person.
 * Controlled, no trigger — opened by clicking a face box that lives on the
 * photo itself, not from a button next to this dialog — so it's built on
 * `ControlledDialogContent` rather than the trigger-based `Dialog`/
 * `FormDialog` this package also has (see that component's own comment).
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
    <ControlledDialogContent isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t("tagFace.identifyThisFace")}</DialogTitle>
      </DialogHeader>
      <TagFaceForm
        face={face}
        onDone={async () => {
          onOpenChange(false);
          await onTagged();
        }}
      />
    </ControlledDialogContent>
  );
}

function TagFaceForm({ face, onDone }: { face: TagFaceTarget; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ["person", "list", { search: query.trim() || null }],
    queryFn: () => listPersons({ data: { limit: 10, offset: 0, search: query.trim() || null } }),
    enabled: personId === null,
  });

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
      <Combobox<PersonSearchResult>
        aria-label={t("person.family.searchPeople")}
        items={search.data?.items ?? []}
        inputValue={query}
        onInputChange={setQuery}
        onChange={(value) => {
          const target = search.data?.items.find((candidate) => candidate.id === value);
          if (target) {
            setPersonId(target.id);
            setPersonName(formatPersonName(target));
          }
        }}
      >
        <ComboboxInput placeholder={t("tagFace.whoseFaceIsThis")} />
        <ComboboxContent<PersonSearchResult>
          renderEmptyState={() => <ComboboxEmpty>{t("person.family.noMatches")}</ComboboxEmpty>}
        >
          {(item) => (
            <ComboboxItem id={item.id} textValue={formatPersonName(item)}>
              {formatPersonName(item)}
              {formatLifespan(item) ? ` (${formatLifespan(item)})` : ""}
            </ComboboxItem>
          )}
        </ComboboxContent>
      </Combobox>
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
          <Button variant="outline" isDisabled={isPending} onPress={() => setPersonId(null)}>
            {t("tagFace.back")}
          </Button>
          <Button isDisabled={isPending} onPress={() => void confirmKnownFace()}>
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
              onPress={() => setMode("existing")}
            >
              {t("tagFace.existingPerson")}
            </Button>
            <Button
              variant={mode === "new" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onPress={() => setMode("new")}
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
                <Button variant="outline" isDisabled={isPending} onPress={() => setPersonId(null)}>
                  {t("tagFace.back")}
                </Button>
                <Button
                  isDisabled={isPending || newName.trim() === ""}
                  onPress={() => void confirmNewImmichPerson()}
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

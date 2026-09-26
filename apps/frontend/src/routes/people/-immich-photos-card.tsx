import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Button } from "@genealogy/ui/components/button";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useState } from "react";

import {
  isImmichConfigured,
  linkImmichPerson,
  listImmichPeople,
  listLinkedImmichPeople,
  listPersonPhotos,
  unlinkImmichPerson,
} from "../../server/functions/immich.functions";

const PEOPLE_PAGE_SIZE = 24;

/**
 * A person's linked-face photo grid — see "Photos & albums via Immich" in
 * FEATURES.md. Not part of `$personId.tsx` itself despite every other
 * section of that page living there: that file is already large, and this
 * one is fully self-contained (its own data, its own dialog). The leading
 * `-` keeps TanStack Start's file-based router from treating it as a route.
 * Hidden entirely, not just empty, when Immich isn't configured — no reason
 * to show a "Photos" card that can only ever say "not set up".
 */
export function PersonPhotosCard({ personId }: { personId: string }) {
  const configured = useQuery({
    queryKey: ["immich", "isConfigured"],
    queryFn: () => isImmichConfigured(),
  });
  if (!configured.data) return null;
  return <PersonPhotosCardContent personId={personId} />;
}

function PersonPhotosCardContent({ personId }: { personId: string }) {
  const queryClient = useQueryClient();
  const linked = useQuery({
    queryKey: ["immich", "linkedPeople", personId],
    queryFn: () => listLinkedImmichPeople({ data: { personId } }),
  });
  const photos = useQuery({
    queryKey: ["immich", "photos", personId],
    queryFn: () => listPersonPhotos({ data: { personId } }),
  });
  const unlinkMutation = useMutation({ mutationFn: unlinkImmichPerson });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["immich", "linkedPeople", personId] }),
      queryClient.invalidateQueries({ queryKey: ["immich", "photos", personId] }),
    ]);
  };

  const unlink = async (linkId: string) => {
    await unlinkMutation.mutateAsync({ data: { linkId } });
    await refresh();
  };

  return (
    <SectionCard
      title="Photos"
      titleClassName="text-base"
      contentClassName="space-y-4"
      action={<LinkFaceDialog personId={personId} onLinked={refresh} />}
    >
      {linked.data && linked.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {linked.data.map((person) => (
            <span
              key={person.linkId}
              className="flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-1 text-xs"
            >
              <Avatar className="size-5">
                <AvatarImage src={`/api/immich/people/${person.id}/thumbnail`} alt="" />
                <AvatarFallback className="text-[10px]">?</AvatarFallback>
              </Avatar>
              {person.name.trim() || "Unnamed"}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-4"
                aria-label={`Unlink ${person.name.trim() || "this face"}`}
                onPress={() => void unlink(person.linkId)}
              >
                <XIcon className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      )}
      {photos.isPending ? (
        <p className="text-xs text-muted-foreground">Loading photos…</p>
      ) : photos.data && photos.data.length > 0 ? (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {photos.data.map((asset) => (
            <div key={asset.id} className="aspect-square overflow-hidden rounded bg-muted">
              <img
                src={`/api/immich/assets/${asset.id}/thumbnail`}
                alt={asset.originalFileName}
                loading="lazy"
                className="size-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No linked photos yet — link a face to find them.
        </p>
      )}
    </SectionCard>
  );
}

function LinkFaceDialog({
  personId,
  onLinked,
}: {
  personId: string;
  onLinked: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const people = useQuery({
    queryKey: ["immich", "listPeople", page],
    queryFn: () => listImmichPeople({ data: { page, size: PEOPLE_PAGE_SIZE } }),
    enabled: open,
  });
  const linkMutation = useMutation({ mutationFn: linkImmichPerson });

  const link = async (immichPersonId: string, close: () => void) => {
    setError(null);
    try {
      await linkMutation.mutateAsync({ data: { personId, immichPersonId } });
      close();
      await onLinked();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Could not link");
    }
  };

  return (
    <FormDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          + Link a face
        </Button>
      }
      title="Link a face"
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPage(1);
          setError(null);
        }
      }}
    >
      {(close) => (
        <>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {people.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : people.data && people.data.people.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {people.data.people.map((person) => (
                <Button
                  key={person.id}
                  type="button"
                  variant="ghost"
                  className="h-auto flex-col gap-1 py-2"
                  isDisabled={linkMutation.isPending}
                  onPress={() => void link(person.id, close)}
                >
                  <Avatar className="size-14">
                    <AvatarImage src={`/api/immich/people/${person.id}/thumbnail`} alt="" />
                    <AvatarFallback>?</AvatarFallback>
                  </Avatar>
                  <span className="w-full truncate text-xs font-normal">
                    {person.name.trim() || "Unnamed"}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No people found in Immich yet.</p>
          )}
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              isDisabled={page === 1}
              onPress={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              isDisabled={!people.data?.hasNextPage}
              onPress={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </FormDialog>
  );
}

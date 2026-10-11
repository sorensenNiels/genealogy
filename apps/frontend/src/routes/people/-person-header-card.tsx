import { calculateAge, researchChecklist, type ResearchChecklist } from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button, buttonVariants } from "@genealogy/ui/components/button";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import { DropdownMenu, DropdownMenuItem } from "@genealogy/ui/components/dropdown-menu";
import { Popover } from "@genealogy/ui/components/popover";
import { ProgressBar } from "@genealogy/ui/components/progress-bar";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CameraIcon, CheckCircle2Icon, CircleIcon, Network, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { publicBackendUrl } from "../../lib/env";
import { useImmichAvailable } from "../../lib/immich-status";
import { usePermissions } from "../../lib/permissions";
import { genderLabel, initials, relationshipToRootLabel } from "../../lib/person-display";
import { usePersonName } from "../../lib/person-name";
import { usePersonPageDate, usePersonSettings } from "../../lib/person-settings";
import { removePerson } from "../../server/functions/person.functions";
import { MergePersonDialog } from "./-merge-person-dialog";
import { SetPhotoFromImmichDialog } from "./-set-photo-from-immich-dialog";
import type { CitationRow, NameVariantRow, PersonEventRow, PersonRow, SourceRow } from "./-types";

/**
 * The identity header: photo, name, badges, birth/death summary, the
 * tree/event actions, the research-completeness bar, and (since it's a
 * person-wide action with no natural home in any one of the field cards
 * below) Delete. Read-only except for the photo, which is already its own
 * instant-apply control (see `PersonPhoto`) — nothing here needs a Save
 * button of its own.
 */
export function PersonHeaderCard({
  person,
  names,
  citations,
  sourcesList,
  events,
  parentCount,
  onChanged,
  canDelete,
  onDeleted,
}: {
  person: PersonRow;
  names: NameVariantRow[];
  citations: CitationRow[];
  sourcesList: SourceRow[];
  events: PersonEventRow[];
  parentCount: number;
  onChanged: () => Promise<void>;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const formatDate = usePersonPageDate();
  const { formatName, formatFullName } = usePersonName();
  const { isAdmin } = usePermissions();
  const removePersonMutation = useMutation({ mutationFn: removePerson, onSuccess: onDeleted });

  const nicknames = names.filter((name) => name.nameType === "nickname").map((name) => name.given);

  // Settings → Person page can turn ages off.
  const age = usePersonSettings().showAges ? calculateAge(person) : null;
  const birthDisplay = formatDate(person.birth);
  const deathDisplay = formatDate(person.death);

  // The page header's birth/death line — date *and* place together
  // ("b. 14 March 1838 · Give Sogn, Vejle Amt").
  const birthSummary = [birthDisplay, person.birthPlace].filter(Boolean).join(" · ") || null;
  const deathSummary = person.isLiving
    ? null
    : [deathDisplay, person.deathPlace].filter(Boolean).join(" · ") || null;

  // The first alternate name (any type but the primary "birth" one), with
  // its earliest citation's source title in parens if it has one — mirrors
  // the mockup's single "Also known as" line.
  const akaName = names.find((name) => name.nameType !== "birth");
  const akaCitation = akaName
    ? citations.find((citation) => citation.factType === "name" && citation.factId === akaName.id)
    : undefined;
  const akaSource = akaCitation
    ? sourcesList.find((source) => source.id === akaCitation.sourceId)
    : undefined;

  const isCited = (eventType: "birth" | "death") => {
    const event = events.find((row) => row.eventType === eventType);
    return (
      !!event &&
      citations.some((citation) => citation.factType === "event" && citation.factId === event.id)
    );
  };
  const checklist = researchChecklist({
    birth: person.birth,
    birthPlace: person.birthPlace,
    death: person.death,
    deathPlace: person.deathPlace,
    isLiving: person.isLiving,
    parentCount,
    birthCited: isCited("birth"),
    deathCited: isCited("death"),
    hasPhoto: person.photoPath != null,
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <PersonPhoto person={person} onChanged={onChanged} size="lg" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                <CopyableText value={person.publicId} className="font-mono text-foreground" />
              </Badge>
              <Badge variant="outline">{genderLabel(person.gender, t)}</Badge>
              {person.redacted && (
                <Badge variant="secondary" title={t("person.header.redactedHint")}>
                  {t("person.header.redacted")}
                </Badge>
              )}
              {person.relationshipToRoot && (
                <Badge className="border-transparent bg-primary/10 text-primary">
                  {relationshipToRootLabel(person.relationshipToRoot, t)}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {formatFullName({ ...person, nickname: nicknames })}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {birthSummary && (
                <span>
                  <span className="font-medium text-foreground">{t("person.header.bornAbbr")}</span>{" "}
                  {birthSummary}
                  {person.isLiving && age !== null ? ` · ${t("person.header.age", { age })}` : ""}
                </span>
              )}
              {!person.isLiving && (
                <span>
                  <span className="font-medium text-foreground">{t("person.header.diedAbbr")}</span>{" "}
                  {deathSummary ?? "—"}
                  {age !== null ? ` · ${t("person.header.age", { age })}` : ""}
                </span>
              )}
            </div>
            {akaName && (
              <p className="text-sm text-muted-foreground">
                {t("person.header.alsoKnownAs")}{" "}
                <span className="text-foreground">{formatName(akaName)}</span>
                {akaSource ? ` (${akaSource.title})` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:w-56 sm:items-end">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link
              to="/tree"
              search={{ personId: person.id }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Network className="size-4" /> {t("person.header.viewInTree")}
            </Link>
            {isAdmin && (
              <MergePersonDialog
                personId={person.id}
                personName={formatFullName(person)}
                onMerged={onChanged}
              />
            )}
            {canDelete && (
              <RemoveButton
                itemLabel={formatFullName(person)}
                title={t("people.deleteTitle", { name: formatFullName(person) })}
                description={t("people.deleteDescription")}
                actionLabel={t("common.delete")}
                onConfirm={() => removePersonMutation.mutate({ data: { id: person.id } })}
                trigger={
                  <Button type="button" variant="outline" size="sm" className="text-destructive">
                    <Trash2Icon /> {t("common.delete")}
                  </Button>
                }
              />
            )}
          </div>
          <ResearchChecklistPopover checklist={checklist} />
          {removePersonMutation.isError && (
            <p className="text-sm text-destructive">{removePersonMutation.error.message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The research-completeness bar, opening the checklist behind it: what's
 * recorded, what's missing, and which missing fact to look for next — so
 * the percentage is a pointer to the next search rather than a grade.
 */
function ResearchChecklistPopover({ checklist }: { checklist: ResearchChecklist }) {
  const { t } = useTranslation();
  return (
    <Popover
      align="end"
      title={t("person.checklist.title")}
      description={
        checklist.next
          ? t("person.checklist.next", { item: t(`person.checklist.item.${checklist.next}`) })
          : t("person.checklist.complete")
      }
      trigger={
        <button
          type="button"
          className="w-full rounded-md p-1 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={t("person.checklist.open", { percent: checklist.percent })}
        >
          <ProgressBar label={t("person.header.researchCompleteness")} value={checklist.percent} />
        </button>
      }
    >
      <ul className="space-y-1.5 text-sm">
        {checklist.checks.map((check) => (
          <li key={check.key} className="flex items-center gap-2">
            {check.done ? (
              <CheckCircle2Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={cn(!check.done && "text-muted-foreground")}>
              {t(`person.checklist.item.${check.key}`)}
            </span>
            <span className="sr-only">
              {check.done ? t("person.checklist.done") : t("person.checklist.missing")}
            </span>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

/**
 * Upload/delete go through this app's own /api/people/$id/photo proxy route
 * (same-origin, cookies ride along automatically) — see
 * routes/api/people/$id/photo.ts. The `<img>` read below still points
 * directly at apps/backend: it's an unauthenticated static file, and a plain
 * `<img src>` isn't subject to CORS regardless, so proxying it would add
 * nothing. See `publicBackendUrl`'s doc comment in lib/env.ts.
 */
function PersonPhoto({
  person,
  onChanged,
  size = "sm",
}: {
  person: PersonRow;
  onChanged: () => Promise<void>;
  /** "lg" is the large, rounded-square avatar on the view-mode header. */
  size?: "sm" | "lg";
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [immichPickerOpen, setImmichPickerOpen] = useState(false);
  // Immich is opt-in infrastructure — same "hidden entirely, not just empty"
  // treatment as `PersonPhotosCard`: no "Choose from Immich" menu item when
  // there's nothing to choose from.
  const immichAvailable = useImmichAvailable();
  const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;
  const dimensionClass = size === "lg" ? "size-24" : "size-16";
  const roundingClass = size === "lg" ? "rounded-xl" : "rounded-full";
  const { canEdit } = usePermissions();

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/people/${person.id}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Photo upload failed: ${response.status}`);
      }
      await onChanged();
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    await fetch(`/api/people/${person.id}/photo`, { method: "DELETE" });
    await onChanged();
  };

  // Viewers see the photo, not a button to change it.
  if (!canEdit) {
    return (
      <PersonPhotoAvatar
        person={person}
        photoUrl={photoUrl}
        size={size}
        roundingClass={roundingClass}
        dimensionClass={dimensionClass}
        uploading={false}
      />
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      {immichAvailable ? (
        <DropdownMenu
          trigger={
            <Button
              variant="ghost"
              className={cn("group relative p-0", dimensionClass, roundingClass)}
              disabled={uploading}
              aria-label={photoUrl ? t("person.photo.change") : t("person.photo.upload")}
            >
              <PersonPhotoAvatar
                person={person}
                photoUrl={photoUrl}
                size={size}
                roundingClass={roundingClass}
                dimensionClass={dimensionClass}
                uploading={uploading}
              />
            </Button>
          }
        >
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            {t("person.photo.uploadAPhoto")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setImmichPickerOpen(true)}>
            {t("person.photo.chooseFromImmich")}
          </DropdownMenuItem>
        </DropdownMenu>
      ) : (
        <Button
          variant="ghost"
          className={cn("group relative p-0", dimensionClass, roundingClass)}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          aria-label={photoUrl ? t("person.photo.change") : t("person.photo.upload")}
        >
          <PersonPhotoAvatar
            person={person}
            photoUrl={photoUrl}
            size={size}
            roundingClass={roundingClass}
            dimensionClass={dimensionClass}
            uploading={uploading}
          />
        </Button>
      )}
      {photoUrl && (
        <RemoveButton itemLabel={t("person.photo.thisPhoto")} onConfirm={() => void remove()} />
      )}
      {immichAvailable && (
        <SetPhotoFromImmichDialog
          personId={person.id}
          isOpen={immichPickerOpen}
          onOpenChange={setImmichPickerOpen}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

function PersonPhotoAvatar({
  person,
  photoUrl,
  size,
  roundingClass,
  dimensionClass,
  uploading,
}: {
  person: PersonRow;
  photoUrl: string | null;
  size: "sm" | "lg";
  roundingClass: string;
  dimensionClass: string;
  uploading: boolean;
}) {
  const { formatName } = usePersonName();
  return (
    <>
      <Avatar className={cn(dimensionClass, roundingClass)}>
        {photoUrl && <AvatarImage src={photoUrl} alt={formatName(person)} />}
        <AvatarFallback className={size === "lg" ? "text-2xl" : "text-base"}>
          {initials(person)}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-data-hovered:opacity-100",
          roundingClass,
        )}
      >
        {uploading ? (
          <span className="text-xs">…</span>
        ) : (
          <CameraIcon className="size-5" aria-hidden="true" />
        )}
      </span>
    </>
  );
}

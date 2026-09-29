import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Button } from "@genealogy/ui/components/button";
import { Input } from "@genealogy/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { listImmichPeople } from "../../server/functions/immich.functions";

// Immich's own documented max for this endpoint — fetched once rather than
// paginated. A family Immich library is small enough that this is one call,
// not hundreds; it also sidesteps Immich's `/people` having no server-side
// name-search parameter at all (confirmed against its OpenAPI spec), so a
// client-side filter over the full set is simpler and more useful than
// paginating through it in fixed-size pages with no way to search.
const PEOPLE_FETCH_SIZE = 1000;

/**
 * A searchable grid of Immich's detected people (named or not) to pick one
 * from — shared by `LinkFaceDialog` (browse & link an existing genealogy
 * person to a face cluster) and `photos/-tag-face-dialog.tsx` (assign a
 * specific detected face to an existing cluster, including one already
 * linked to a *different* genealogy person — the caller finds out then,
 * from the mutation's own error, rather than this component filtering
 * clusters up front).
 *
 * Deliberately has no `enabled`/open gating of its own: every call site
 * renders this only while its own dialog is actually mounted (inside a
 * `FormDialog`'s render-prop, or an equivalent controlled dialog), so the
 * query already starts and stops with that.
 */
export function ImmichPersonPicker({
  onPick,
  isDisabled,
}: {
  onPick: (immichPersonId: string) => void;
  isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const people = useQuery({
    queryKey: ["immich", "listPeople"],
    queryFn: () => listImmichPeople({ data: { page: 1, size: PEOPLE_FETCH_SIZE } }),
  });
  // If a library somehow has over 1000 distinct Immich people, this only
  // ever shows the first page of them — not worth building further
  // pagination on top of a search for a case this app's scale won't hit.

  const filtered = (people.data?.people ?? []).filter((person) =>
    person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <Input
        placeholder={t("person.immichPicker.searchByName")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t("person.immichPicker.searchAriaLabel")}
      />
      {people.isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : people.isError ? (
        <p className="text-sm text-destructive">
          {t("person.immichPicker.couldNotLoad", { message: people.error.message })}
        </p>
      ) : filtered.length > 0 ? (
        <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto">
          {filtered.map((person) => (
            <Button
              key={person.id}
              type="button"
              variant="ghost"
              className="h-auto flex-col gap-1 py-2"
              {...(isDisabled !== undefined ? { isDisabled } : {})}
              onPress={() => onPick(person.id)}
            >
              <Avatar className="size-14">
                <AvatarImage src={`/api/immich/people/${person.id}/thumbnail`} alt="" />
                <AvatarFallback>?</AvatarFallback>
              </Avatar>
              <span className="w-full truncate text-xs font-normal">
                {person.name.trim() || t("common.unnamedPerson")}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {query.trim()
            ? t("person.immichPicker.noMatchingPeople")
            : t("person.immichPicker.noPeopleFound")}
        </p>
      )}
    </div>
  );
}

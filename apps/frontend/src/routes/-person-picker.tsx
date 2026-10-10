import { formatLifespan, formatPersonName } from "@genealogy/core";
import { Combobox } from "@genealogy/ui/components/combobox";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { listPersons } from "../server/functions/person.functions";

/** One person as the person search returns them. */
export type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

/** "Name (lifespan)", or just the name when nothing is known — how a person shows in a search result. */
export function formatPersonWithLifespan(
  person: Parameters<typeof formatPersonName>[0] & Parameters<typeof formatLifespan>[0],
): string {
  const lifespan = formatLifespan(person);
  return lifespan ? `${formatPersonName(person)} (${lifespan})` : formatPersonName(person);
}

export interface PersonPickerProps {
  /** Called with the person picked from the results. */
  onSelect: (person: PersonListItem) => void;
  /** People not to offer — e.g. whoever is already a parent of this person. */
  excludeIds?: ReadonlySet<string> | undefined;
  /** How many results to show at most. */
  limit?: number | undefined;
  /** Defaults to "Search people". */
  "aria-label"?: string | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
}

/**
 * Search the tree for a person and pick one — the box behind "add a
 * parent/sibling/spouse", merging, tagging a face, linking a member, the
 * tree's "find". Owns the query: type, it searches the backend (`limit`
 * results, everyone when empty), leaves out `excludeIds`, and lists each
 * match as "Name (lifespan)".
 */
export function PersonPicker({
  onSelect,
  excludeIds,
  limit = 10,
  "aria-label": ariaLabel,
  placeholder,
  className,
}: PersonPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const searchInput = { limit, offset: 0, search: trimmed === "" ? null : trimmed };
  const search = useQuery({
    queryKey: ["person", "list", searchInput],
    queryFn: () => listPersons({ data: searchInput }),
    // Keep the last results listed while the next keystroke's search runs,
    // instead of the list emptying (and the popup resizing) on every key.
    placeholderData: keepPreviousData,
  });
  const people = (search.data?.items ?? []).filter((person) => !excludeIds?.has(person.id));

  return (
    <Combobox
      aria-label={ariaLabel ?? t("person.family.searchPeople")}
      placeholder={placeholder ?? t("person.family.searchPeople")}
      items={people}
      itemKey={(person) => person.id}
      itemLabel={formatPersonName}
      renderItem={formatPersonWithLifespan}
      inputValue={query}
      onInputValueChange={setQuery}
      onSelect={onSelect}
      emptyText={search.isPending ? undefined : t("person.family.noMatches")}
      className={className}
    />
  );
}

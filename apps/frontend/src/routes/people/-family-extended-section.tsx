import { formatLifespan } from "@genealogy/core";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { usePersonName } from "../../lib/person-name";
import type { PersonRow, RelativesResult } from "./-types";

/** The derived lists, in the order the card shows them, each with its heading's key under `person.family`. */
const GROUPS = [
  "stepParents",
  "stepSiblings",
  "stepChildren",
  "parentsInLaw",
  "siblingsInLaw",
  "childrenInLaw",
] as const satisfies readonly (keyof RelativesResult)[];

/**
 * Step-relations and in-laws on the Family card: worked out from marriages
 * on the server (`PersonService.relatives`), so there's no edge of their
 * own to add or remove here — they change when the marriages and parents
 * they come from do. Only the non-empty groups show; with the settings off
 * every list is empty and this renders nothing.
 */
export function ExtendedFamilySection({ relatives }: { relatives: RelativesResult }) {
  const { t } = useTranslation();
  const groups = GROUPS.filter((group) => relatives[group].length > 0);
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((group) => (
        <div key={group} className="space-y-2 border-t pt-4">
          <span className="text-sm font-medium">{t(`person.family.${group}`)}</span>
          <div className="space-y-2">
            {relatives[group].map((person) => (
              <RelativeLink key={person.id} person={person} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function RelativeLink({ person }: { person: PersonRow }) {
  const { formatName } = usePersonName();
  const lifespan = formatLifespan(person);
  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className="block text-sm hover:underline"
    >
      {formatName(person)}
      {lifespan && <span className="ml-1 text-muted-foreground">({lifespan})</span>}
    </Link>
  );
}

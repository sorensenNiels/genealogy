import { formatLifespan, formatPersonName } from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Card, CardContent } from "@genealogy/ui/components/card";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { publicBackendUrl } from "../../lib/env";
import { avatarColorClass, GenderIcon, genderLabel, initials } from "../../lib/person-display";
import type { listPersons } from "../../server/functions/person.functions";

type PersonListItem = Awaited<ReturnType<typeof listPersons>>["items"][number];

/**
 * The photo-forward alternative to the People table: one large tap target
 * per person (avatar with gender badge, name, lifespan, place, status), no
 * secondary actions.
 * Aimed at browsing rather than research — the table stays the dense,
 * filterable view for that.
 */
export function PeopleCardView({ people }: { people: PersonListItem[] }) {
  const { t } = useTranslation();

  if (people.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">{t("people.noMatches")}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {people.map((person) => (
        <PersonCard key={person.id} person={person} />
      ))}
    </div>
  );
}

function PersonCard({ person }: { person: PersonListItem }) {
  const { t } = useTranslation();
  const photoUrl = person.photoPath ? `${publicBackendUrl}/uploads/${person.photoPath}` : null;
  const lifespan = formatLifespan(person);
  const place = person.birthPlace ?? person.deathPlace;

  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Card className="h-full items-center gap-3 py-6 text-center transition-shadow hover:shadow-md">
        {/* The gender badge sits on the avatar's edge, outside `Avatar` itself
            (which clips its children): it keeps the centered name balanced,
            and still says the gender once a photo hides the initials' color. */}
        <div className="relative">
          <Avatar className="size-24">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback className={`text-2xl ${avatarColorClass(person.gender)}`}>
              {initials(person)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border bg-card shadow-sm">
            <GenderIcon gender={person.gender} className="size-4" />
            <span className="sr-only">{genderLabel(person.gender, t)}</span>
          </span>
        </div>
        <CardContent className="flex w-full flex-col items-center gap-1 px-4">
          <p className="text-base font-semibold">{formatPersonName(person)}</p>
          {lifespan && <p className="text-sm text-muted-foreground">{lifespan}</p>}
          {place && <p className="text-sm text-muted-foreground">{place}</p>}
          <Badge variant={person.isLiving ? "secondary" : "outline"} className="mt-1">
            {person.isLiving ? t("people.living") : t("people.deceased")}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

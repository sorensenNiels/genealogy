import { formatLifespan } from "@genealogy/core";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { publicBackendUrl } from "../lib/env";
import { avatarColorClass, initials } from "../lib/person-display";
import { usePersonName } from "../lib/person-name";

/** A person as a small row: avatar, name and lifespan, linking to their page. */
export function PersonChip({
  person,
  size = "sm",
}: {
  person: {
    id: string;
    given: string;
    surname: string;
    gender: "M" | "F" | "U";
    photoPath: string | null;
    birth: Parameters<typeof formatLifespan>[0]["birth"];
    death: Parameters<typeof formatLifespan>[0]["death"];
  };
  size?: "sm" | "lg";
}) {
  const { t } = useTranslation();
  const { formatName } = usePersonName();
  const lifespan = formatLifespan(person);
  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className="flex min-w-0 items-center gap-3 rounded-md hover:underline"
    >
      <Avatar className={size === "lg" ? "size-14" : "size-8"}>
        {person.photoPath && (
          <AvatarImage src={`${publicBackendUrl}/uploads/${person.photoPath}`} alt="" />
        )}
        <AvatarFallback className={`text-xs ${avatarColorClass(person.gender)}`}>
          {initials(person)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className={size === "lg" ? "block text-lg font-semibold" : "block truncate text-sm"}>
          {formatName(person) || t("tools.unnamed")}
        </span>
        {lifespan && <span className="block text-xs text-muted-foreground">{lifespan}</span>}
      </span>
    </Link>
  );
}

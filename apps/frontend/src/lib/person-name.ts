import { formatFullPersonName, formatPersonName, type PersonNameFormat } from "@genealogy/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { usePersonSettings } from "./person-settings";

type NameInput = Parameters<typeof formatPersonName>[0] & { redacted?: boolean };
type FullNameInput = Parameters<typeof formatFullPersonName>[0] & { redacted?: boolean };

/**
 * A redacted person with no name left is someone living a Viewer isn't
 * shown at all (Settings → Person page, "What Viewers see of the living"):
 * `PersonRedactor` blanks the name, and this is where it reads "Living
 * person" instead of "Unknown".
 */
function isHiddenName(person: NameInput): boolean {
  return person.redacted === true && person.given.trim() === "" && person.surname.trim() === "";
}

export interface PersonNameFormatters {
  /** `formatPersonName` in the site's name format (Settings → Person page). */
  formatName: (person: NameInput) => string;
  /** `formatFullPersonName` in the site's name format — the person page header. */
  formatFullName: (person: FullNameInput) => string;
  nameFormat: PersonNameFormat;
}

/**
 * Every name the app shows goes through this, so the "Name display" setting
 * reaches all of them. A hook rather than a plain function because the
 * format is a site setting loaded with the person settings; a helper that
 * can't call hooks (a table column, a text builder) takes `formatName` as a
 * parameter from the component that renders it.
 */
export function usePersonName(): PersonNameFormatters {
  const { t } = useTranslation();
  const { nameFormat } = usePersonSettings();
  return useMemo(
    () => ({
      nameFormat,
      formatName: (person) =>
        isHiddenName(person) ? t("person.livingPerson") : formatPersonName(person, nameFormat),
      formatFullName: (person) =>
        isHiddenName(person) ? t("person.livingPerson") : formatFullPersonName(person, nameFormat),
    }),
    [nameFormat, t],
  );
}

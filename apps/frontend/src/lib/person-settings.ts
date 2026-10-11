import {
  defaultPersonSettings,
  yearOf,
  type HistoricalDate,
  type PersonSettings,
} from "@genealogy/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { toSupportedLanguage } from "../i18n/create-i18n-instance";
import { formatDisplayDate } from "./format-date";
import { personSettingsQuery } from "./queries";

/** One cache entry for the person page's settings, shared by the person page and the Settings form. */
export const personSettingsQueryKey = personSettingsQuery().queryKey;

export function usePersonSettingsQuery() {
  return useQuery(personSettingsQuery());
}

/** The settings to use — the defaults until (or if) the real ones load, so the page never waits on them. */
export function usePersonSettings(): PersonSettings {
  return usePersonSettingsQuery().data ?? defaultPersonSettings;
}

/**
 * A date as the person page shows it (Settings → Person page, "Dates and
 * ages"): in full, or just the year — the original wording when there's no
 * year to take, so an unparsed date is never hidden. Display only; the
 * edit fields always show the date as entered.
 */
export function usePersonPageDate(): (date: HistoricalDate | null | undefined) => string | null {
  const { i18n } = useTranslation();
  const { dateDetail } = usePersonSettings();
  const language = toSupportedLanguage(i18n.language);
  return useCallback(
    (date) =>
      dateDetail === "years"
        ? date
          ? (yearOf(date) ?? date.original)
          : null
        : formatDisplayDate(date, language),
    [dateDetail, language],
  );
}

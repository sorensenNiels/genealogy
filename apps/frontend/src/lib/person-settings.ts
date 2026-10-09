import { defaultPersonSettings, type PersonSettings } from "@genealogy/core";
import { useQuery } from "@tanstack/react-query";

import { getPersonSettings } from "../server/functions/settings.functions";

/** One cache entry for the person page's settings, shared by the person page and the Settings form. */
export const personSettingsQueryKey = ["settings", "personSettings"] as const;

export function usePersonSettingsQuery() {
  return useQuery({ queryKey: personSettingsQueryKey, queryFn: () => getPersonSettings() });
}

/** The settings to use — the defaults until (or if) the real ones load, so the page never waits on them. */
export function usePersonSettings(): PersonSettings {
  return usePersonSettingsQuery().data ?? defaultPersonSettings;
}

import { defaultRecordSettings, type RecordSettings } from "@genealogy/core";
import { useQuery } from "@tanstack/react-query";

import { getRecordSettings } from "../server/functions/settings.functions";

/** One cache entry for the Records settings, shared by record pages, the person page and the Settings form. */
export const recordSettingsQueryKey = ["settings", "recordSettings"] as const;

export function useRecordSettingsQuery() {
  return useQuery({ queryKey: recordSettingsQueryKey, queryFn: () => getRecordSettings() });
}

/** The settings to use — the defaults until (or if) the real ones load. */
export function useRecordSettings(): RecordSettings {
  return useRecordSettingsQuery().data ?? defaultRecordSettings;
}

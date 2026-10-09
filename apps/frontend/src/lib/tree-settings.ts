import { defaultTreeSettings, type TreeSettings } from "@genealogy/core";
import { useQuery } from "@tanstack/react-query";

import { getTreeSettings } from "../server/functions/settings.functions";

/** One cache entry for the tree's display settings, shared by the tree page and the Settings form. */
export const treeSettingsQueryKey = ["settings", "treeSettings"] as const;

export function useTreeSettingsQuery() {
  return useQuery({ queryKey: treeSettingsQueryKey, queryFn: () => getTreeSettings() });
}

/** The settings to draw with — the defaults until (or if) the real ones load, so the tree never waits on them. */
export function useTreeSettings(): TreeSettings {
  return useTreeSettingsQuery().data ?? defaultTreeSettings;
}

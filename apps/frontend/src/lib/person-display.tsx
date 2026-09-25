import type { RelationshipToRoot, Sex } from "@genealogy/core";
import { CircleHelp, Mars, Venus } from "lucide-react";

// Stored values stay the M/F/U schema; only the displayed labels change here.
// Revisit once i18n lands — this should become a translation lookup, not a
// hardcoded English map.
export const SEX_LABELS: Record<Sex, string> = {
  M: "Male",
  F: "Female",
  U: "Unknown",
};

/**
 * Labels for the badge shown on a person's page relative to whoever is
 * currently viewing — each account has its own "this is me" link (set from
 * the Profile page), not one tree-wide root, so this is per-viewer.
 */
export const RELATIONSHIP_TO_ROOT_LABELS: Record<Exclude<RelationshipToRoot, null>, string> = {
  root: "This is you",
  ancestor: "Direct ancestor",
  descendant: "Direct descendant",
};

interface ConfigurableOptionLike {
  topic: string;
  key: string;
  label: string;
}

/** Every configurable option for one topic (event type, confidence, ...), in display order. */
export function optionsFor<T extends ConfigurableOptionLike>(all: T[], topic: string): T[] {
  return all.filter((option) => option.topic === topic);
}

/**
 * A key's display label, looked up from the fetched configurable options —
 * falling back to the raw key so a record referencing an option that was
 * since deleted from Settings still renders something instead of going blank.
 * Shared between the person detail page and the print view, so both show the
 * same wording.
 */
export function labelFor<T extends ConfigurableOptionLike>(
  all: T[],
  topic: string,
  key: string,
): string {
  return optionsFor(all, topic).find((option) => option.key === key)?.label ?? key;
}

export function GenderIcon({ sex, className = "size-5" }: { sex: Sex; className?: string }) {
  const props = {
    className: `${className} shrink-0 text-muted-foreground`,
    "aria-hidden": true,
  } as const;
  if (sex === "M") return <Mars {...props} />;
  if (sex === "F") return <Venus {...props} />;
  return <CircleHelp {...props} />;
}

export function initials(person: { given: string; surname: string }): string {
  const parts = [person.given, person.surname].filter((part) => part.trim() !== "");
  const letters = parts.map((part) => part.trim()[0]?.toUpperCase() ?? "").join("");
  return letters === "" ? "?" : letters;
}

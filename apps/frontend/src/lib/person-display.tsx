import type { Gender, RelationshipToRoot } from "@genealogy/core";
import type { TFunction } from "i18next";
import { CircleHelp, Mars, Venus } from "lucide-react";

// Stored values stay the M/F/U GEDCOM schema; only the displayed labels are
// translated, via `common.gender.*` — a plain function rather than a hook
// (`t` passed in) so this also works from non-component call sites like
// `@tanstack/react-table` cell renderers, the same reasoning
// `format-date.ts`'s helpers give for staying functions.
export function genderLabel(gender: Gender, t: TFunction): string {
  return t(`common.gender.${gender}`);
}

/**
 * Labels for the badge shown on a person's page relative to whoever is
 * currently viewing — each account has its own "this is me" link (set from
 * the Profile page), not one tree-wide root, so this is per-viewer.
 */
export function relationshipToRootLabel(
  relationship: Exclude<RelationshipToRoot, null>,
  t: TFunction,
): string {
  return t(`common.relationshipToRoot.${relationship}`);
}

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
 * One topic's configurable options as `Select` options —
 * `<Select options={selectOptionsFor(options, "confidence")} … />`.
 */
export function selectOptionsFor<T extends ConfigurableOptionLike>(
  all: T[],
  topic: string,
): { value: string; label: string }[] {
  return optionsFor(all, topic).map((option) => ({ value: option.key, label: option.label }));
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

export function GenderIcon({
  gender,
  className = "size-5",
}: {
  gender: Gender;
  className?: string;
}) {
  const props = {
    className: `${className} shrink-0 text-muted-foreground`,
    "aria-hidden": true,
  } as const;
  if (gender === "M") return <Mars {...props} />;
  if (gender === "F") return <Venus {...props} />;
  return <CircleHelp {...props} />;
}

export function initials(person: { given: string; surname: string }): string {
  const parts = [person.given, person.surname].filter((part) => part.trim() !== "");
  const letters = parts.map((part) => part.trim()[0]?.toUpperCase() ?? "").join("");
  return letters === "" ? "?" : letters;
}

/**
 * Background/text pair for the People list's avatar-initials fallback — the
 * one place in the app that colors by gender, so a row is scannable at a
 * glance without reading the Gender column. Plain Tailwind palette classes
 * rather than new theme tokens, since this is a single-purpose accent, not a
 * reusable design-system color.
 */
export function avatarColorClass(gender: Gender): string {
  if (gender === "M") return "bg-blue-100 text-blue-700";
  if (gender === "F") return "bg-pink-100 text-pink-700";
  return "bg-muted text-muted-foreground";
}

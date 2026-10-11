import type { Gender, RelationshipToRoot } from "@genealogy/core";
import { cn } from "@genealogy/ui/lib/utils";
import type { TFunction } from "i18next";
import { Mars, Venus } from "lucide-react";
import type { ReactNode } from "react";

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

/**
 * The tree's gender badge (tree-chart.css's `.card-gender`): a white ♂ or ♀
 * on a sky or rose disc — one look for gender everywhere in the app, so a
 * person reads the same in the tree, the lists and their own page. Unknown
 * is a slate disc with "?" (the tree draws no badge for it, but a list
 * column needs something there). `className` sizes the disc; the icon
 * scales with it. Decorative — pair it with `genderLabel` for words.
 */
export function GenderIcon({
  gender,
  className = "size-5",
}: {
  gender: Gender;
  className?: string;
}) {
  const icon = "size-[62%]";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-white",
        GENDER_DISC_CLASS[gender],
        className,
      )}
    >
      {gender === "M" ? (
        <Mars className={icon} strokeWidth={3} />
      ) : gender === "F" ? (
        <Venus className={icon} strokeWidth={3} />
      ) : (
        <span className="text-[0.65em] leading-none font-bold">?</span>
      )}
    </span>
  );
}

/** The tree's colours: `--tree-male`, `--tree-female`, `--tree-unknown`. */
const GENDER_DISC_CLASS: Record<Gender, string> = {
  M: "bg-sky-500",
  F: "bg-rose-500",
  U: "bg-slate-400",
};

/**
 * An avatar with the gender badge over its bottom-right corner, ringed in
 * the card colour so it reads as cut out of the photo — the tree card's
 * badge, on the app's own avatars. Nothing for unknown, as on the tree.
 */
export function WithGenderBadge({
  gender,
  children,
  badgeClassName = "size-4",
}: {
  gender: Gender;
  children: ReactNode;
  badgeClassName?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      {gender !== "U" && (
        <GenderIcon
          gender={gender}
          className={cn("absolute -right-0.5 -bottom-0.5 ring-2 ring-card", badgeClassName)}
        />
      )}
    </span>
  );
}

export function initials(person: { given: string; surname: string }): string {
  const parts = [person.given, person.surname].filter((part) => part.trim() !== "");
  const letters = parts.map((part) => part.trim()[0]?.toUpperCase() ?? "").join("");
  return letters === "" ? "?" : letters;
}

/**
 * Background/text pair for an avatar's initials fallback, in the tree's
 * gender colours (sky and rose, like `GenderIcon`), so a photo-less person
 * is tinted the same in a list as on their tree card. Plain Tailwind
 * palette classes rather than theme tokens, matching the tree's own.
 */
export function avatarColorClass(gender: Gender): string {
  if (gender === "M") return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
  if (gender === "F") return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
  return "bg-muted text-muted-foreground";
}

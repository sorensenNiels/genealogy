import type { Sex } from "@genealogy/core";
import { CircleHelp, Mars, Venus } from "lucide-react";

// Stored values stay the M/F/U schema; only the displayed labels change here.
// Revisit once i18n lands — this should become a translation lookup, not a
// hardcoded English map.
export const SEX_LABELS: Record<Sex, string> = {
  M: "Male",
  F: "Female",
  U: "Unknown",
};

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

import type { SupportedLanguage } from "./create-i18n-instance";

/**
 * apps/backend is English-only by design (see "Internationalization" in
 * FEATURES.md) — every `BadRequestException`/`NotFoundException`/etc.
 * message it throws is a plain English sentence, and always will be. This
 * is the one place those get translated, applied centrally by
 * `trpc-error-translation-link.ts` rather than touching any of the ~30
 * call sites across apps/backend/src or the ~40 server function files that
 * proxy them. A message that matches neither table below is passed through
 * untranslated — still correct, just English, never broken or blank.
 *
 * Deliberately not exhaustive: a handful of backend messages embed raw HTTP
 * status text from Immich's own API ("Immich request failed: 404 (...)")
 * that varies too much to template cleanly and is closer to a debug detail
 * than end-user copy — those are left as an accepted English fallback.
 */
const EXACT: Record<string, string> = {
  "Invalid download id": "Ugyldigt download-id",
  "No file uploaded": "Ingen fil uploadet",
  "Only image or video files are accepted": "Kun billede- eller videofiler accepteres",
  "Only image files are accepted": "Kun billedfiler accepteres",
  "Immich is not configured": "Immich er ikke konfigureret",
  "Immich returned an empty archive response": "Immich returnerede et tomt arkivsvar",
  "Either immichPersonId or newImmichPersonName is required":
    "Enten immichPersonId eller newImmichPersonName er påkrævet",
  "Already linked to this person": "Allerede knyttet til denne person",
  "An album category with that name already exists":
    "Der findes allerede en albumkategori med det navn",
  "Unknown album category": "Ukendt albumkategori",
  "Only editors can change the family tree": "Kun redaktører kan ændre slægtstræet",
  "Only admins can do that": "Det kan kun administratorer",
  "Someone with that email address is already a member":
    "Der er allerede et medlem med den e-mailadresse",
  "No such pending invitation": "Ingen sådan åben invitation",
  "No such member": "Intet sådant medlem",
  "You can't remove yourself": "Du kan ikke fjerne dig selv",
  "There must always be at least one admin": "Der skal altid være mindst én administrator",
  "This person already has that external id": "Personen har allerede dette eksterne id",
  "This Immich person is already linked to someone else":
    "Denne Immich-person er allerede knyttet til en anden",
  "No such Immich person": "Ingen sådan Immich-person",
  "Invalid backup id": "Ugyldigt backup-id",
  "Backup not found — it may already have been downloaded, or hasn't finished generating yet.":
    "Backup blev ikke fundet — den er muligvis allerede downloadet, eller er ikke færdiggenereret endnu.",
  "Download not found — it may already have been downloaded, or hasn't finished generating yet.":
    "Download blev ikke fundet — den er muligvis allerede downloadet, eller er ikke færdiggenereret endnu.",
  "Expected a .sql.gz backup file": "Forventede en .sql.gz-backupfil",
  "This person still has recorded relationships. Remove those first.":
    "Denne person har stadig registrerede relationer. Fjern dem først.",
  "Someone else has already identified as this person":
    "En anden har allerede identificeret sig som denne person",
  "This album has no photos to download": "Dette album har ingen fotos at downloade",
  "There are no photos to download yet": "Der er endnu ingen fotos at downloade",
  "This GEDCOM file contains no people": "Denne GEDCOM-fil indeholder ingen personer",
  "That event doesn't belong to this person": "Den begivenhed tilhører ikke denne person",
  "That marriage doesn't belong to this person": "Det ægteskab tilhører ikke denne person",
  "Not a GEDCOM file — it doesn't start with a HEAD record":
    "Ikke en GEDCOM-fil — den starter ikke med en HEAD-post",
};

const TEMPLATES: { pattern: RegExp; translate: (...groups: string[]) => string }[] = [
  {
    pattern: /^File exceeds the (\d+)MB limit$/,
    translate: (mb) => `Filen overskrider grænsen på ${mb}MB`,
  },
  {
    pattern: /^No configurable option with id (.+)$/,
    translate: (id) => `Ingen konfigurerbar indstilling med id ${id}`,
  },
  { pattern: /^No event with id (.+)$/, translate: (id) => `Ingen begivenhed med id ${id}` },
  {
    pattern: /^No name variant with id (.+)$/,
    translate: (id) => `Ingen navnevariant med id ${id}`,
  },
  { pattern: /^No note with id (.+)$/, translate: (id) => `Ingen note med id ${id}` },
  { pattern: /^No person with id (.+)$/, translate: (id) => `Ingen person med id ${id}` },
  {
    pattern: /^No research note with id (.+)$/,
    translate: (id) => `Ingen forskningsnote med id ${id}`,
  },
  {
    pattern: /^These two people can't be merged \((.+)\)$/,
    translate: (reasons) => `Disse to personer kan ikke flettes (${reasons})`,
  },
  {
    pattern: /^No album category with id (.+)$/,
    translate: (id) => `Ingen albumkategori med id ${id}`,
  },
  { pattern: /^No union with id (.+)$/, translate: (id) => `Intet parforhold med id ${id}` },
  {
    pattern:
      /^This person already has a (.+) event — edit it from the person page instead of adding another\.$/,
    translate: (eventType) =>
      `Denne person har allerede en ${eventType}-begivenhed — rediger den fra personsiden i stedet for at tilføje en ny.`,
  },
  {
    pattern: /^"(.+)" already exists under this topic — pick a different key\.$/,
    translate: (key) => `"${key}" findes allerede under dette emne — vælg en anden nøgle.`,
  },
  {
    pattern: /^"(.+)" is a built-in option and can't be removed\.$/,
    translate: (label) => `"${label}" er en indbygget indstilling og kan ikke fjernes.`,
  },
  {
    pattern: /^"(.+)" is still used by at least one record and can't be removed\.$/,
    translate: (label) => `"${label}" bruges stadig af mindst én post og kan ikke fjernes.`,
  },
];

export function translateBackendError(message: string, language: SupportedLanguage): string {
  if (language === "en") return message;

  const exact = EXACT[message];
  if (exact) return exact;

  for (const { pattern, translate } of TEMPLATES) {
    const match = pattern.exec(message);
    if (match) return translate(...match.slice(1));
  }

  return message;
}

import type { OverviewCard } from "@genealogy/core";
import type { TFunction } from "i18next";

/** The Overview card names — for its "Customize" menu and Settings → Overview. */
export function overviewCardLabel(card: OverviewCard, t: TFunction): string {
  switch (card) {
    case "yourPlace":
      return t("overview.line.title");
    case "continue":
      return t("overview.continue.title");
    default:
      return t(`overview.${card}.title`);
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Today in the member's own time zone, as YYYY-MM-DD — what "On this day"
 * and the featured ancestor are for. Server-rendered, it's the server's
 * today; near midnight that can differ, and the client then just fetches
 * its own day's.
 */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

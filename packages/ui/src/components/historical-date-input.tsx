import { parseDate } from "@internationalized/date";
import { CalendarCheckIcon, CalendarIcon, TriangleAlertIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Input } from "./input";
import { Popover, PopoverContent } from "./popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

/** `value`/`endValue` are free text, not always a bare ISO date — this is just a best-effort seed for where the calendar opens. */
function tryParseDate(text: string) {
  try {
    return parseDate(text.trim());
  } catch {
    return undefined;
  }
}

/**
 * The five qualities offered by the dropdown in front of the date. Kept as a
 * local literal union rather than importing `DateQuality` from
 * `@genealogy/core` — this package never depends on core (see the dependency
 * direction in CLAUDE.md); the two are kept in sync by hand, and it's this
 * exact five-item set that `@genealogy/core`'s `splitHistoricalDateText`/
 * `joinHistoricalDateText` split and join.
 */
export type HistoricalDateQuality = "exact" | "about" | "before" | "after" | "between";

const QUALITY_OPTIONS: { id: HistoricalDateQuality; label: string }[] = [
  { id: "exact", label: "Exact" },
  { id: "about", label: "About" },
  { id: "before", label: "Before" },
  { id: "after", label: "After" },
  { id: "between", label: "Between" },
];

export interface HistoricalDatePreview {
  /** The normalized wording to show, or the raw text when it couldn't be read. */
  text: string;
  status: "parsed" | "unparsed";
}

export interface HistoricalDateInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type"
> {
  /**
   * Omit both `quality` and `onQualityChange` together to drop the dropdown
   * entirely and always behave as "Exact" — for a call site with nothing to
   * qualify (the People list's "Born after"/"Born before" filters: each is
   * already a single boundary date, not a fuzzy one someone would mark
   * About/Before/After/Between). The value stays free text either way, so
   * "abt 1854" still resolves correctly even with the dropdown hidden — this
   * only removes the affordance for picking that shorthand from a menu, not
   * the parser's ability to read it.
   */
  quality?: HistoricalDateQuality;
  onQualityChange?: (quality: HistoricalDateQuality) => void;
  /** The date value — the range's start when `quality` is "between". */
  value: string;
  onChange: (value: string) => void;
  /** The range's end. Only rendered/used when `quality` is "between". */
  endValue?: string;
  onEndChange?: (value: string) => void;
  /**
   * How the current text was understood — computed by the caller (this
   * package never imports `@genealogy/core`, so it can't parse dates
   * itself). Pass `null` for an empty field: no preview row is rendered.
   */
  preview: HistoricalDatePreview | null;
}

/**
 * The default date field for the whole app: a quality dropdown (Exact/About/
 * Before/After/Between) in front of one date value — or two, joined by
 * "and", when quality is Between — plus a live preview of how the assembled
 * text was understood. The value input(s) stay free text first and
 * foremost, since a genealogical date is very often only a year or a
 * month/year that no calendar widget can represent — but each also gets a
 * calendar-icon button that opens a real date picker for the common case of
 * an exact day, writing back the same ISO `YYYY-MM-DD` text a person could
 * have typed by hand (see `parseDatePart` in `@genealogy/core`, which reads
 * that format already). The caller is responsible for assembling
 * `value`/`endValue` back into a single stored string (see
 * `joinHistoricalDateText` in `@genealogy/core`).
 *
 * The free-text/parsed-preview split is also what keeps this ready for
 * i18n later: this component never itself decides what a date "looks
 * like" — `value`/`endValue` are plain strings and `preview` is handed in
 * already formatted, so swapping the (currently GEDCOM-English-only)
 * parser/formatter in `@genealogy/core` for a locale-aware one is a change
 * at the caller, not here.
 */
export function HistoricalDateInput({
  className,
  quality,
  onQualityChange,
  value,
  onChange,
  endValue,
  onEndChange,
  preview,
  placeholder,
  ...props
}: HistoricalDateInputProps) {
  return (
    <div data-slot="historical-date-input" className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        {quality !== undefined && onQualityChange && (
          <Select
            aria-label="Date quality"
            value={quality}
            onChange={(key) => {
              if (key) onQualityChange(key as HistoricalDateQuality);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_OPTIONS.map((option) => (
                <SelectItem key={option.id} id={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={preview?.status === "unparsed"}
          placeholder={quality === "between" ? (placeholder ?? "Start") : placeholder}
          {...props}
        />
        <DatePickerButton value={value} onChange={onChange} aria-label="Pick a date" />
      </div>
      {quality === "between" && onEndChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">and</span>
          <Input
            value={endValue ?? ""}
            onChange={(event) => onEndChange(event.target.value)}
            aria-label="End date"
            placeholder="End"
          />
          <DatePickerButton
            value={endValue ?? ""}
            onChange={onEndChange}
            aria-label="Pick an end date"
          />
        </div>
      )}
      {preview && (
        <p
          data-slot="historical-date-input-preview"
          className={cn(
            "flex items-center gap-1.5 text-xs",
            preview.status === "parsed" ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {preview.status === "parsed" ? (
            <CalendarCheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          {preview.text}
        </p>
      )}
    </div>
  );
}

/**
 * The calendar-icon button next to a value input. Seeds the calendar from
 * the current text when it happens to already be a bare ISO date, opening
 * to today's month otherwise; picking a day writes it back as that same
 * ISO text and closes, leaving the free-text box just as editable as before.
 */
function DatePickerButton({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button type="button" variant="outline" size="icon" aria-label={ariaLabel}>
        <CalendarIcon className="size-4" />
      </Button>
      <PopoverContent className="w-fit p-3">
        <Calendar
          value={tryParseDate(value) ?? null}
          onChange={(date) => {
            onChange(date.toString());
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

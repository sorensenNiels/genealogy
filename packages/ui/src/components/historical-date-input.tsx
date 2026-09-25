import { CalendarCheckIcon, TriangleAlertIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

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
  quality: HistoricalDateQuality;
  onQualityChange: (quality: HistoricalDateQuality) => void;
  /** The date value — the range's start when `quality` is "between". */
  value: string;
  onChange: (value: string) => void;
  /** The range's end. Only rendered/used when `quality` is "between". */
  endValue: string;
  onEndChange: (value: string) => void;
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
 * text was understood. The value input(s) stay free text rather than a real
 * date picker, since a genealogical date is very often only a year or a
 * month/year — the caller is responsible for assembling `value`/`endValue`
 * back into a single stored string (see `joinHistoricalDateText` in
 * `@genealogy/core`).
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
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={preview?.status === "unparsed"}
          placeholder={quality === "between" ? (placeholder ?? "Start") : placeholder}
          {...props}
        />
      </div>
      {quality === "between" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">and</span>
          <Input
            value={endValue}
            onChange={(event) => onEndChange(event.target.value)}
            aria-label="End date"
            placeholder="End"
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

import { CalendarCheckIcon, TriangleAlertIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils";
import { Input } from "./input";

export interface HistoricalDatePreview {
  /** The normalized wording to show, or the raw text when it couldn't be read. */
  text: string;
  status: "parsed" | "unparsed";
}

export interface HistoricalDateInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type"
> {
  value: string;
  onChange: (value: string) => void;
  /**
   * How the current text was understood — computed by the caller (this
   * package never imports `@genealogy/core`, so it can't parse dates
   * itself). Pass `null` for an empty field: no preview row is rendered.
   */
  preview: HistoricalDatePreview | null;
}

/**
 * A free-text date field with a live preview of how the text was
 * understood — a calendar icon once it resolves to a real date, a warning
 * icon when it doesn't. The input itself still accepts and saves whatever
 * was typed either way; this is feedback, not validation.
 */
export function HistoricalDateInput({
  className,
  value,
  onChange,
  preview,
  ...props
}: HistoricalDateInputProps) {
  return (
    <div data-slot="historical-date-input" className={cn("space-y-1", className)}>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={preview?.status === "unparsed"}
        {...props}
      />
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

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  Calendar as RACCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  type CalendarProps as RACCalendarProps,
  type DateValue,
} from "react-aria-components";

import { cn } from "../lib/utils";
import { Button } from "./button";

export function Calendar<T extends DateValue>({ className, ...props }: RACCalendarProps<T>) {
  return (
    <RACCalendar className={cn("w-fit", className)} {...props}>
      <header className="flex items-center justify-between pb-2">
        <Button slot="previous" variant="ghost" size="icon" className="size-7">
          <ChevronLeftIcon className="size-4" />
        </Button>
        <CalendarHeading className="text-sm font-medium" />
        <Button slot="next" variant="ghost" size="icon" className="size-7">
          <ChevronRightIcon className="size-4" />
        </Button>
      </header>
      <CalendarGrid className="w-full border-collapse">
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="pb-1 text-xs font-normal text-muted-foreground">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => (
            <CalendarCell
              date={date}
              className={cn(
                "flex size-8 cursor-default items-center justify-center rounded-md text-sm outline-hidden",
                "data-hovered:bg-accent data-hovered:text-accent-foreground",
                "data-selected:bg-primary data-selected:text-primary-foreground",
                "data-outside-month:text-muted-foreground/50",
                "data-disabled:pointer-events-none data-disabled:opacity-50",
                "data-unavailable:pointer-events-none data-unavailable:text-muted-foreground/50 data-unavailable:line-through",
                "data-focus-visible:ring-[3px] data-focus-visible:ring-ring/50",
                "data-today:border data-today:border-primary",
              )}
            />
          )}
        </CalendarGridBody>
      </CalendarGrid>
    </RACCalendar>
  );
}

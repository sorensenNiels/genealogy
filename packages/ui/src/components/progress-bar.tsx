import { cn } from "../lib/utils";
import { Progress, ProgressLabel, ProgressValue } from "./ui/progress";

export interface ProgressBarProps {
  /** 0–100. */
  value: number;
  label?: string | undefined;
  className?: string | undefined;
}

/**
 * A determinate progress bar: label and percentage on one line, the filled
 * track under it. The percentage is Base UI's own formatted value, so screen
 * readers get the same number as the text (`aria-valuetext`), not just the
 * bar's width.
 */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  return (
    <Progress value={value} className={cn("w-full gap-1", className)}>
      {label && (
        <ProgressLabel className="text-xs font-normal text-muted-foreground">{label}</ProgressLabel>
      )}
      <ProgressValue className="text-xs font-medium" />
    </Progress>
  );
}

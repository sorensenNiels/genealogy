import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, letting a caller's utility override a component's own
 * without specificity games: `cn("p-2", "p-4")` yields `p-4`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

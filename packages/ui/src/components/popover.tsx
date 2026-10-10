import { useState, type ReactElement, type ReactNode } from "react";

import { cn } from "../lib/utils";
import {
  Popover as PopoverRoot,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./ui/popover";

export interface PopoverProps {
  /** The element it's anchored to and opened by — a `Button` or `IconButton`. */
  trigger: ReactElement;
  /** Optional heading; leave out for a popover whose content speaks for itself (a calendar). */
  title?: ReactNode | undefined;
  description?: ReactNode | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** As a function it gets `close`, e.g. to close once a date is picked. */
  children: ReactNode | ((close: () => void) => ReactNode);
  side?: "top" | "bottom" | "left" | "right" | undefined;
  align?: "start" | "center" | "end" | undefined;
  className?: string | undefined;
}

/**
 * Non-modal content anchored to its trigger: `<Popover trigger={<Button…/>}>…</Popover>`.
 * Controlled or not, the body can close it through the `close` it's given.
 */
export function Popover({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  children,
  side,
  align,
  className,
}: PopoverProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <PopoverRoot open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side={side} align={align} className={cn(className)}>
        {(title || description) && (
          <PopoverHeader>
            {title && <PopoverTitle>{title}</PopoverTitle>}
            {description && <PopoverDescription>{description}</PopoverDescription>}
          </PopoverHeader>
        )}
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </PopoverContent>
    </PopoverRoot>
  );
}

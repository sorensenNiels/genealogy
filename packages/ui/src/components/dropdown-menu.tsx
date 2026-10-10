import type { ComponentProps, ReactElement, ReactNode } from "react";

import { cn } from "../lib/utils";
import {
  DropdownMenu as DropdownMenuRoot,
  DropdownMenuContent,
  DropdownMenuItem as DropdownMenuItemPrimitive,
  DropdownMenuSeparator as DropdownMenuSeparatorPrimitive,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export interface DropdownMenuProps {
  /** The element that opens it — a `Button`, `IconButton`, or a `Tooltip` around one. */
  trigger: ReactElement;
  /** A non-interactive row above the items — e.g. the signed-in user's name, a "Notifications" heading. */
  header?: ReactNode | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  align?: "start" | "center" | "end" | undefined;
  className?: string | undefined;
  /** `DropdownMenuItem`s, `DropdownMenuSeparator`s, `DropdownMenuLabel`s. */
  children: ReactNode;
}

/** A menu of actions opened from a trigger: `<DropdownMenu trigger={<Button…/>}>{items}</DropdownMenu>`. */
export function DropdownMenu({
  trigger,
  header,
  open,
  onOpenChange,
  align,
  className,
  children,
}: DropdownMenuProps) {
  return (
    <DropdownMenuRoot
      {...(open === undefined ? {} : { open })}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} className={cn("min-w-48", className)}>
        {header}
        {children}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}

export interface DropdownMenuItemProps {
  onClick?: ComponentProps<typeof DropdownMenuItemPrimitive>["onClick"] | undefined;
  disabled?: boolean | undefined;
  /** Red, for an item that removes or signs out. */
  variant?: "default" | "destructive" | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/** One action in a `DropdownMenu`; choosing it runs `onClick` and closes the menu. */
export function DropdownMenuItem({ variant = "default", ...props }: DropdownMenuItemProps) {
  return <DropdownMenuItemPrimitive variant={variant} {...props} />;
}

/** A small non-interactive row — e.g. as a `DropdownMenu`'s `header`. */
export function DropdownMenuLabel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-2 py-1.5 text-sm font-medium", className)} {...props} />;
}

/** A rule between groups of items. */
export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DropdownMenuSeparatorPrimitive className={className} />;
}

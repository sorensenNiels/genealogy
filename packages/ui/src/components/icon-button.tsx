import type { ReactNode } from "react";

import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "aria-label"> {
  /** Names the button for screen readers and is shown as its tooltip. */
  label: string;
  icon: ReactNode;
  /** Off for a button whose meaning is obvious from where it sits (a dialog's ×). */
  tooltip?: boolean | undefined;
}

/**
 * An icon-only button that always says what it does: `label` becomes both
 * its accessible name and a tooltip, so neither can be forgotten. Like
 * `Button` it forwards props and `ref`, so it works as any overlay's
 * `trigger` — tooltip included.
 */
export function IconButton({
  label,
  icon,
  tooltip = true,
  variant = "ghost",
  size = "icon",
  ...props
}: IconButtonProps) {
  const button = (
    <Button variant={variant} size={size} aria-label={label} {...props}>
      {icon}
    </Button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}

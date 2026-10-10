import type { VariantProps } from "class-variance-authority";
import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";

import { cn } from "../../lib/utils";
import { buttonVariants } from "../ui/button";

/**
 * A React Aria button with the nova `Button` look, for the components that
 * stay on React Aria — `Calendar`'s `slot="previous"`/`"next"` and
 * `PhotoGrid`'s `slot="drag"` only work with a React Aria pressable. The
 * nova classes key off `hover:`/`focus-visible:`/`disabled:`, which React
 * Aria's button triggers like any native one. Internal to this package.
 */
export function AriaButton({
  className,
  variant,
  size,
  ...props
}: Omit<RACButtonProps, "className"> &
  VariantProps<typeof buttonVariants> & { className?: string }) {
  return <RACButton className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

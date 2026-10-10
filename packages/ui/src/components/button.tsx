import type { ComponentProps } from "react";

import { Button as ButtonPrimitive, buttonVariants } from "./ui/button";

export type ButtonProps = ComponentProps<typeof ButtonPrimitive>;

/**
 * The app's button: the nova primitive, with `type="button"` as the default
 * rather than the native `"submit"` — a button inside a `<form>` should only
 * submit it when it says so (`SaveButton` does), the same default React
 * Aria's button had. Forwards every prop and its `ref`, so it can be a
 * `render` target for a dialog, menu, popover or tooltip trigger.
 */
export function Button({ type = "button", ...props }: ButtonProps) {
  return <ButtonPrimitive type={type} {...props} />;
}

export { buttonVariants };

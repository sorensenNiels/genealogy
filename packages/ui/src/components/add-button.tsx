import { PlusIcon } from "lucide-react";

import { IconButton, type IconButtonProps } from "./icon-button";

export type AddButtonProps = Omit<IconButtonProps, "icon" | "variant">;

/**
 * The "+" in a card's header that adds one more of what the card lists —
 * a parent, an event, a citation. An outline `IconButton`, so `label` is
 * both its name and its tooltip; usable as a `FormDialog`/`DropdownMenu`
 * trigger like any button.
 */
export function AddButton(props: AddButtonProps) {
  return <IconButton variant="outline" icon={<PlusIcon className="size-4" />} {...props} />;
}

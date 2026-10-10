import { Separator as SeparatorPrimitive } from "./ui/separator";

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical" | undefined;
  className?: string | undefined;
}

/** A thin rule between groups of content, announced as a separator. */
export function Separator({ orientation = "horizontal", className }: SeparatorProps) {
  return <SeparatorPrimitive orientation={orientation} className={className} />;
}

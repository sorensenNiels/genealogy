import type { ReactNode } from "react";

export function LabeledField({
  label,
  className,
  /**
   * A plain `<label>` forwards a click anywhere inside it (that isn't
   * itself a labelable element) to the *first* labelable descendant —
   * fine when that's the one input/select this wraps, wrong when the
   * child is a widget with its own internal buttons that happen to come
   * first in the DOM (MarkdownEditor's toolbar). Set this for a child
   * that already carries its own `aria-label` and renders a plain `<div>`
   * instead, so text-area clicks stop silently also clicking "Undo".
   */
  asDiv = false,
  children,
}: {
  label: string;
  className?: string;
  asDiv?: boolean;
  children: ReactNode;
}) {
  const Tag = asDiv ? "div" : "label";
  return (
    <Tag className={`block space-y-1 text-sm ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Tag>
  );
}

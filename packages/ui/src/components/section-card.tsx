import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

export interface SectionCardProps {
  /** The card's heading. */
  title: ReactNode;
  /** An optional line under the title. */
  description?: ReactNode;
  /**
   * Rendered at the header's far end — an "Add" icon button, most often.
   * Its presence is what switches the header from a single stacked column
   * (title, then description) to a row with this pinned to the right.
   */
  action?: ReactNode;
  /** Rendered in a `CardFooter` below the content — a Save/Cancel row, most often. */
  footer?: ReactNode;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  children: ReactNode;
}

/**
 * The `Card`/`CardHeader`/`CardTitle`/`CardContent` shell repeated by every
 * card in this app — a heading, an optional description, an optional
 * header-right action, content, and an optional footer. A new card is
 * "`SectionCard` with a title and content" instead of four nested primitives
 * copied from whichever existing card was closest.
 */
export function SectionCard({
  title,
  description,
  action,
  footer,
  className,
  titleClassName,
  contentClassName,
  footerClassName,
  children,
}: SectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader
        className={action ? "flex flex-row items-center justify-between gap-2" : undefined}
      >
        {action ? (
          <div className="space-y-1.5">
            <CardTitle className={titleClassName}>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        ) : (
          <>
            <CardTitle className={titleClassName}>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </>
        )}
        {action}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
      {footer && <CardFooter className={footerClassName}>{footer}</CardFooter>}
    </Card>
  );
}

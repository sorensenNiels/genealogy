import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Lightbox, LightboxButton } from "./lightbox";

export interface ImageViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode | undefined;
  caption?: ReactNode | undefined;
  /** Omitted (rather than disabled) hides the arrow entirely — there's nothing to go back/forward to. */
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  /** Controls below the image — e.g. the tag-face actions in `AssetViewer`. */
  footer?: ReactNode | undefined;
  children: ReactNode;
}

/**
 * A photo in a `Lightbox`, with previous/next arrows either side and an
 * optional caption and footer under it. Fully controlled: callers open it
 * from a thumbnail elsewhere on the page.
 */
export function ImageViewer({
  open,
  onOpenChange,
  title,
  caption,
  onPrevious,
  onNext,
  footer,
  children,
}: ImageViewerProps) {
  return (
    <Lightbox open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex items-center gap-3">
        {onPrevious && (
          <LightboxButton onClick={onPrevious} aria-label="Previous photo">
            <ChevronLeftIcon className="size-5" />
          </LightboxButton>
        )}
        <div className="max-h-[70vh] max-w-[80vw] overflow-auto">{children}</div>
        {onNext && (
          <LightboxButton onClick={onNext} aria-label="Next photo">
            <ChevronRightIcon className="size-5" />
          </LightboxButton>
        )}
      </div>
      {caption && <p className="text-xs text-white/70">{caption}</p>}
      {footer}
    </Lightbox>
  );
}

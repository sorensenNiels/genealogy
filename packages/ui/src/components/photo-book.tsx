import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { Lightbox, LightboxButton } from "./lightbox";

export type PhotoBookPaperStyle = "black" | "grey" | "cream" | "modern";

export interface PhotoBookPhoto {
  id: string;
  src: string;
  alt: string;
  caption?: string;
  /** A virtual album's photo naming its physical source, e.g. "FYS-001 · Mormor Else's album, p. 3". */
  sourceLabel?: string;
}

export interface PhotoBookPage {
  id: string;
  photos: PhotoBookPhoto[];
}

export interface PhotoBookProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Pre-rendered cover art — a physical album's foil/label/tooled style, or a
   * virtual album's photo collage. Cover styling is album-kind-specific
   * business logic that lives with the caller (see `-album-cover.tsx`); this
   * component only knows how to flip whatever it's handed.
   */
  coverNode: ReactNode;
  insideCoverNode: ReactNode;
  /** Already paginated by the caller — see `paginate` in `@genealogy/core`. No per-photo page number is stored anywhere; this is just however the caller last computed it. */
  pages: PhotoBookPage[];
  paperStyle: PhotoBookPaperStyle;
}

const PAPER_CLASSES: Record<PhotoBookPaperStyle, string> = {
  black: "bg-neutral-900 text-neutral-100",
  grey: "bg-neutral-600 text-neutral-50",
  cream: "bg-amber-100 text-amber-950",
  modern: "bg-card text-card-foreground",
};

function PagePaper({
  page,
  paperStyle,
}: {
  page: PhotoBookPage | undefined;
  paperStyle: PhotoBookPaperStyle;
}) {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-3 overflow-hidden rounded-r-sm p-6",
        PAPER_CLASSES[paperStyle],
      )}
    >
      {!page || page.photos.length === 0 ? (
        <p className="text-sm opacity-50">(blank page)</p>
      ) : (
        <div
          className={cn(
            "grid size-full gap-3",
            page.photos.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {page.photos.map((photo) => (
            <figure
              key={photo.id}
              className="flex min-h-0 flex-col items-center justify-center gap-1"
            >
              <img
                src={photo.src}
                alt={photo.alt}
                className="max-h-full max-w-full rounded-sm object-contain shadow-md"
              />
              {(photo.caption || photo.sourceLabel) && (
                <figcaption className="text-center text-xs opacity-80">
                  {photo.caption}
                  {photo.sourceLabel && (
                    <span className="block opacity-70">{photo.sourceLabel}</span>
                  )}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A full-viewport "book" overlay for a physical album's scanned pages, or a
 * virtual album's referenced photos rendered in a plainer "modern" paper
 * style — the reading-mode counterpart to the grid/list views, opened from
 * either. Sits in a `Lightbox` like `ImageViewer` (fully controlled
 * `open`/`onOpenChange`; the overlay's own open/close animation comes with
 * it), but its layout is its own: a CSS3D page-flip, one absolutely positioned "leaf" per pair of
 * pages (the first leaf's two faces are the cover and its inside), each face
 * `backface-visibility: hidden` so only one side shows at a time, and a
 * single `turnedLeaves` counter (0 = closed, `totalLeaves` = fully read)
 * driving which leaves have rotated — plain CSS transitions, not `motion`,
 * since a single repeated 3D rotation doesn't need spring/gesture machinery,
 * and `motion-reduce:` disables it for `prefers-reduced-motion` the same way
 * Tailwind's own variant is meant to be used.
 *
 * Real keyboard (arrow keys, while open) *and* explicit, labeled prev/next
 * buttons are both always present — unlike the paper-prototype this is
 * modeled on, which only responds to clicking the page itself, this gives
 * keyboard and screen-reader users an equally discoverable way to turn pages.
 */
export function PhotoBook({
  open,
  onOpenChange,
  title,
  coverNode,
  insideCoverNode,
  pages,
  paperStyle,
}: PhotoBookProps) {
  const [turnedLeaves, setTurnedLeaves] = useState(0);
  // The leaf currently mid-flip stays on top of the whole stack for the
  // duration of its own rotation, then settles into its resting z-index only
  // once the transition actually finishes (`onTransitionEnd` below) — not the
  // instant the click happens. Without this, a leaf's z-index would jump
  // straight to its *post*-flip value at the same moment its rotation
  // starts, which exposes the destination page's content at its final
  // stacking order before the rotation has visually caught up, reading as
  // "the photo pops in, then the turn plays" instead of a single smooth
  // motion. Mirrors the original prototype's own delayed z-index bump.
  const [animatingLeaf, setAnimatingLeaf] = useState<number | null>(null);

  const totalLeaves = 1 + Math.ceil(pages.length / 2);
  const atStart = turnedLeaves === 0;
  const atEnd = turnedLeaves === totalLeaves;

  // Clamped, functional-update-only — the arrow-key listener below is set up
  // once per open/close (not on every `turnedLeaves` change), so `next`/`prev`
  // must never read `turnedLeaves` from their own closure or they'd act on a
  // stale value the second time they're called.
  const next = () => setTurnedLeaves((n) => Math.min(n + 1, totalLeaves));
  const prev = () => setTurnedLeaves((n) => Math.max(n - 1, 0));

  // Figures out which leaf just started (de)flipping by comparing against
  // the previous render's count, whatever triggered the change (a click or
  // an arrow key) — see `animatingLeaf`'s own comment above for why this
  // needs tracking at all. Runs as an effect, not inside `next`/`prev`
  // themselves, for the same stale-closure reason those stay clamp-only.
  const previousTurnedLeaves = useRef(turnedLeaves);
  useEffect(() => {
    const previous = previousTurnedLeaves.current;
    if (turnedLeaves !== previous) setAnimatingLeaf(Math.min(turnedLeaves, previous));
    previousTurnedLeaves.current = turnedLeaves;
  }, [turnedLeaves]);

  // Belt-and-suspenders for `onTransitionEnd` below: `prefers-reduced-motion`
  // drops the transition duration to 0 via `motion-reduce:transition-none`,
  // and some browsers never fire `transitionend` for a 0-duration transition
  // — without this, `animatingLeaf` would stay stuck elevated indefinitely.
  useEffect(() => {
    if (animatingLeaf === null) return;
    const timeout = window.setTimeout(() => setAnimatingLeaf(null), 750);
    return () => window.clearTimeout(timeout);
  }, [animatingLeaf]);

  // Arrow-key page-turning, scoped for as long as the book is open. A window
  // listener rather than an `onKeyDown` on a wrapping `<div>` — a static element
  // with its own key handler needs an interactive role it wouldn't otherwise
  // have; this also keeps working regardless of which control inside
  // currently has focus. Capture phase, because the Base UI dialog the book
  // sits in stops arrow-key events before they'd bubble up to `window`.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- next/prev only use functional setState, no stale closure risk
  }, [open]);

  // Every leaf (both faces) is already mounted from the moment the book
  // opens, so the network fetch for every photo starts immediately — but a
  // browser's actual *decode* of an image it has never painted yet is a
  // separate, lazier step that a finished fetch doesn't guarantee has
  // happened. Paging forward can land on a page whose photos have never been
  // painted before, so that decode (plus the resulting first composite)
  // happens live, mid-flip, and reads as a flicker; paging backward only
  // ever re-shows pages that were already decoded the first time they were
  // seen, which is exactly why the flicker was one-directional. Forcing
  // every photo's decode up front here, as soon as the book opens, means
  // forward navigation never hits an undecoded image either.
  useEffect(() => {
    if (!open) return;
    for (const page of pages) {
      for (const photo of page.photos) {
        const preload = new Image();
        preload.src = photo.src;
        void preload.decode?.().catch(() => {});
      }
    }
  }, [open, pages]);

  return (
    <Lightbox
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) setTurnedLeaves(0);
      }}
      title={title}
      className="w-[calc(100%-2rem)] max-w-4xl sm:w-full"
    >
      <div className="relative aspect-5/3 w-full perspective-[2400px]">
        <div
          className={cn(
            "absolute inset-y-0 right-0 w-1/2 rounded-r-sm shadow-xl",
            PAPER_CLASSES[paperStyle],
          )}
        />
        {!atStart && (
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-1/2 rounded-l-sm shadow-xl",
              PAPER_CLASSES[paperStyle],
            )}
          />
        )}

        {Array.from({ length: totalLeaves }, (_, leafIndex) => {
          const isCover = leafIndex === 0;
          const pageIndex = (leafIndex - 1) * 2;
          const frontPage = isCover ? undefined : pages[pageIndex];
          const backPage = isCover ? undefined : pages[pageIndex + 1];
          const flipped = leafIndex < turnedLeaves;

          const isAnimating = leafIndex === animatingLeaf;
          const zIndex = isAnimating
            ? totalLeaves + 1
            : flipped
              ? leafIndex
              : totalLeaves - leafIndex;

          return (
            <div
              key={isCover ? "cover" : (frontPage?.id ?? `blank-${leafIndex}`)}
              className="absolute inset-y-0 left-1/2 w-1/2 origin-left transition-transform duration-700 ease-in-out transform-3d motion-reduce:transition-none"
              style={{ transform: flipped ? "rotateY(-180deg)" : "rotateY(0deg)", zIndex }}
              onTransitionEnd={() => {
                if (isAnimating) setAnimatingLeaf(null);
              }}
            >
              <div className="absolute inset-0 backface-hidden">
                {isCover ? coverNode : <PagePaper page={frontPage} paperStyle={paperStyle} />}
              </div>
              <div className="absolute inset-0 rotate-y-180 backface-hidden">
                {isCover ? insideCoverNode : <PagePaper page={backPage} paperStyle={paperStyle} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-white">
        <LightboxButton onClick={prev} disabled={atStart} aria-label="Previous page">
          <ChevronLeftIcon className="size-5" />
        </LightboxButton>
        <span className="min-w-32 text-center font-mono text-xs text-white/70">
          {atStart ? "Closed" : atEnd ? "End of album" : `Turned ${turnedLeaves} of ${totalLeaves}`}
        </span>
        <LightboxButton onClick={next} disabled={atEnd} aria-label="Next page">
          <ChevronRightIcon className="size-5" />
        </LightboxButton>
      </div>
    </Lightbox>
  );
}

import { useTranslation } from "react-i18next";

import type { AlbumWithMetadata } from "./-edit-album-dialog";

/**
 * Layered background-image gradients standing in for cloth texture and a
 * spine-fold highlight on a physical album's cover — lifted from the design
 * reference's own `.cover.physical` rule (a subtle diagonal weave plus a
 * soft light falloff), not a texture image, so it scales to any size/color
 * with no asset to ship.
 */
const CLOTH_TEXTURE = [
  "linear-gradient(90deg,rgba(0,0,0,.38) 0,rgba(0,0,0,.08) 7%,rgba(255,255,255,.07) 8.5%,transparent 11%)",
  "repeating-linear-gradient(45deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px)",
  "repeating-linear-gradient(-45deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px)",
  "radial-gradient(ellipse at 60% 30%,rgba(255,255,255,.12),transparent 60%)",
].join(",");

/**
 * Renders an album's cover art — the one place that turns an
 * `AlbumWithMetadata` into cover markup, reused by the shelf view's spines
 * and as the `PhotoBook`'s `coverNode`/`insideCoverNode`, so the two never
 * draw the cover two different ways. `@container` (inline-size) lets the
 * title/label scale with `cqw` units so the same markup reads correctly at
 * both the small shelf-spine size and the much larger book-cover size.
 *
 * A virtual album's cover uses its single `albumThumbnailAssetId` (already
 * on every `listAlbums` row) rather than a multi-photo collage — a collage
 * needs that album's own ordered asset list, which would mean fetching every
 * virtual album's photos just to render the shelf grid. Worth revisiting if
 * a real collage turns out to matter more than avoiding that N+1 fetch.
 */
export function AlbumCover({
  album,
  variant,
}: {
  album: AlbumWithMetadata;
  variant: "spine" | "inside";
}) {
  const { t } = useTranslation();

  if (album.kind === "virtual") {
    return (
      <div className="@container relative size-full overflow-hidden rounded-r-sm border border-dashed border-emerald-700/70 bg-[#e9ece8] dark:border-emerald-600/60 dark:bg-emerald-950">
        {album.albumThumbnailAssetId && variant === "spine" && (
          <img
            src={`/api/immich/assets/${album.albumThumbnailAssetId}/thumbnail`}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-40 saturate-[0.8]"
          />
        )}
        <div className="absolute inset-x-[7%] bottom-[10%] rounded-xs border border-dashed border-emerald-800/60 bg-white/85 px-[5cqw] py-[4cqw] text-center shadow-sm backdrop-blur-sm dark:border-emerald-400/50 dark:bg-black/60">
          <p className="font-serif text-[7.2cqw] leading-tight text-emerald-950 dark:text-emerald-100">
            {album.albumName}
          </p>
          {variant === "inside" && (
            <p className="mt-[1.5cqw] font-mono text-[4.2cqw] tracking-wide text-emerald-700 dark:text-emerald-300">
              {t("album.kindVirtual")}
            </p>
          )}
        </div>
      </div>
    );
  }

  const color = album.cover?.color ?? "#2f4034";
  const style = album.cover?.style ?? "label";

  return (
    <div
      className="@container relative size-full overflow-hidden rounded-r-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25),inset_0_0_18px_rgba(0,0,0,0.35)]"
      style={{ background: color, backgroundImage: CLOTH_TEXTURE }}
    >
      {style === "tooled" && (
        <div
          className="pointer-events-none absolute inset-[6%] left-[15%] rounded-[1px] border border-amber-200/55 outline outline-offset-[-5px] outline-amber-200/30"
          aria-hidden="true"
        />
      )}
      {style === "label" ? (
        <div className="absolute inset-x-[14%] top-[34%] rounded-[1px] bg-[#efe8d6] px-[4cqw] py-[6cqw] text-center shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_#c9bea4]">
          <p className="font-serif text-[6.8cqw] leading-snug text-[#2b261e] italic">
            {album.albumName}
          </p>
        </div>
      ) : (
        <div className="absolute inset-x-[9%] top-[16%] text-center">
          <p className="font-serif text-[9.5cqw] leading-tight text-[#d8bd7a] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">
            {album.albumName}
          </p>
        </div>
      )}
    </div>
  );
}

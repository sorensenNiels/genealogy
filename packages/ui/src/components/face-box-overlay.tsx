import { XIcon } from "lucide-react";

import { cn } from "../lib/utils";

export interface FaceBox {
  id: string;
  /** Fractions of the rendered image, 0–1. */
  left: number;
  top: number;
  width: number;
  height: number;
  label?: string;
  state: "linked" | "untagged" | "unknown";
}

export interface FaceBoxOverlayProps {
  src: string;
  alt: string;
  boxes: FaceBox[];
  onBoxPress?: (boxId: string) => void;
  /** Present → a linked box's label gets a leading X button to unlink it directly, no confirmation (matches the Photos card's own unlink chip). */
  onUnlinkPress?: (boxId: string) => void;
  /** Boxes stay mounted either way — for a "show faces" toggle without re-fetching. */
  showBoxes?: boolean;
  className?: string;
}

const STATE_STYLES: Record<FaceBox["state"], string> = {
  linked: "border-primary hover:bg-primary/15 focus-visible:ring-primary",
  untagged: "border-amber-500 hover:bg-amber-500/15 focus-visible:ring-amber-500",
  unknown:
    "border-muted-foreground hover:bg-muted-foreground/15 focus-visible:ring-muted-foreground",
};

/**
 * An image with clickable, percentage-positioned boxes over detected faces —
 * no canvas needed, each box is a plain absolutely-positioned `<button>` sized
 * as a fraction of the image. The wrapper is sized to the *rendered* image
 * (`inline-block w-fit h-fit` around the `<img>`) rather than stretching to
 * fill its parent — boxes positioned against a letterboxed container would
 * drift away from the faces they're meant to sit over.
 */
export function FaceBoxOverlay({
  src,
  alt,
  boxes,
  onBoxPress,
  onUnlinkPress,
  showBoxes = true,
  className,
}: FaceBoxOverlayProps) {
  return (
    <div className={cn("relative inline-block h-fit w-fit", className)}>
      <img src={src} alt={alt} className="block max-h-[70vh] max-w-full" />
      {showBoxes &&
        boxes.map((box) => (
          // A positioned wrapper, not the box button itself, carries the
          // fractional placement — the label's leading unlink button needs
          // to be a sibling of the face-box button, not nested inside it
          // (an interactive control can't nest inside another one).
          <div
            key={box.id}
            className="absolute"
            style={{
              left: `${box.left * 100}%`,
              top: `${box.top * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          >
            <button
              type="button"
              aria-label={box.label ?? "Detected face"}
              onClick={() => onBoxPress?.(box.id)}
              className={cn(
                "absolute inset-0 rounded-sm border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                STATE_STYLES[box.state],
              )}
            />
            {box.label && (
              <span className="absolute -bottom-5 left-0 flex items-center gap-0.5 truncate rounded bg-popover px-1 text-xs text-nowrap text-popover-foreground shadow-sm">
                {box.state === "linked" && onUnlinkPress && (
                  <button
                    type="button"
                    aria-label={`Unlink ${box.label}`}
                    onClick={() => onUnlinkPress(box.id)}
                    className="-ml-0.5 rounded-sm outline-none hover:text-destructive focus-visible:ring-1 focus-visible:ring-destructive"
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
                {box.label}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

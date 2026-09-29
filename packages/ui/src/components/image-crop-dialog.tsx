import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "./button";
import { ControlledDialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

export interface ImageCropDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Re-mount the cropper fresh for a new image (e.g. when a caller keeps this component mounted across multiple crops) by changing `key` at the call site — this component doesn't reset `zoom`/`crop` on its own if `imageSrc` changes underneath it. */
  imageSrc: string;
  onCropped: (blob: Blob) => void;
  /** Shown next to "Use this photo" — e.g. returning to a photo picker without closing the whole flow. Omit to hide the button entirely. */
  onBack?: () => void;
  isSaving?: boolean;
}

/**
 * A circular-selection cropper for turning an existing photo into a square
 * image (displayed circular by `Avatar`'s own CSS — see the doc comment on
 * whichever call site uses this for why no real alpha-channel circle is
 * baked into the stored file). Built on `react-easy-crop` (`Cropper`) rather
 * than hand-rolled drag/zoom/pinch math — see this feature's own plan for
 * why that library was picked.
 *
 * Uses `ControlledDialogContent` (the same "no adjacent trigger" shell
 * `TagFaceDialog` uses) rather than `ImageViewer`'s full-viewport black
 * shell — a crop tool is a modest utility dialog, not a full-bleed photo
 * viewer.
 */
export function ImageCropDialog({
  isOpen,
  onOpenChange,
  imageSrc,
  onCropped,
  onBack,
  isSaving = false,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const confirm = async (): Promise<void> => {
    if (!croppedAreaPixels) return;
    const blob = await cropToBlob(imageSrc, croppedAreaPixels);
    onCropped(blob);
  };

  return (
    <ControlledDialogContent isOpen={isOpen} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Choose a photo</DialogTitle>
      </DialogHeader>

      <div className="relative h-80 w-full overflow-hidden rounded-md bg-muted">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
        />
      </div>

      <label className="flex items-center gap-3 text-sm text-muted-foreground">
        Zoom
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="flex-1"
          aria-label="Zoom"
        />
      </label>

      <DialogFooter>
        {onBack && (
          <Button type="button" variant="outline" isDisabled={isSaving} onPress={onBack}>
            Back
          </Button>
        )}
        <Button
          type="button"
          isDisabled={isSaving || !croppedAreaPixels}
          onPress={() => void confirm()}
        >
          {isSaving ? "Saving…" : "Use this photo"}
        </Button>
      </DialogFooter>
    </ControlledDialogContent>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load the image to crop")));
    image.src = src;
  });
}

/** Draws just the selected pixel region onto a same-sized canvas and exports it — a plain square JPEG, not a circular PNG; see this component's own doc comment for why. */
async function cropToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get a 2D canvas context");
  }
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not export the cropped image"));
      },
      "image/jpeg",
      0.92,
    );
  });
}

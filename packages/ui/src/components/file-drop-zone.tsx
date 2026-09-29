import { UploadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button, DropZone, FileTrigger, Text } from "react-aria-components";

import { cn } from "../lib/utils";

export interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  /** e.g. `["image/*"]`. */
  acceptedFileTypes?: string[];
  allowsMultiple?: boolean;
  /** Client-side pre-check, mirroring the server's own cap — rejected files are simply left out of what's passed to `onFilesSelected`. */
  maxBytes?: number;
  isDisabled?: boolean;
  label?: ReactNode;
  className?: string;
}

/**
 * Drag-and-drop and click-to-pick from one component, built on RAC's
 * `DropZone` + `FileTrigger` rather than a hidden `<input type="file">` —
 * the click-to-pick pattern `PersonPhoto` uses elsewhere is a single-avatar
 * click, a different affordance suited to that one call site, not
 * retrofitted here.
 */
export function FileDropZone({
  onFilesSelected,
  acceptedFileTypes,
  allowsMultiple = true,
  maxBytes,
  isDisabled,
  label = "Drag photos here, or",
  className,
}: FileDropZoneProps) {
  const accept = (files: File[]): void => {
    const accepted = maxBytes ? files.filter((file) => file.size <= maxBytes) : files;
    if (accepted.length > 0) {
      onFilesSelected(accepted);
    }
  };

  return (
    <DropZone
      {...(isDisabled !== undefined ? { isDisabled } : {})}
      className={({ isDropTarget, isFocusVisible }) =>
        cn(
          "flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-input p-6 text-center transition-colors",
          isDropTarget && "border-primary bg-primary/5",
          isFocusVisible && "ring-2 ring-ring ring-offset-2",
          isDisabled && "pointer-events-none opacity-50",
          className,
        )
      }
      onDrop={async (event) => {
        const fileItems = event.items.filter((item) => item.kind === "file");
        const files = await Promise.all(fileItems.map((item) => item.getFile()));
        accept(files);
      }}
    >
      <UploadIcon className="size-6 text-muted-foreground" aria-hidden="true" />
      <Text slot="label" className="text-sm text-muted-foreground">
        {label}{" "}
        <FileTrigger
          {...(acceptedFileTypes !== undefined ? { acceptedFileTypes } : {})}
          allowsMultiple={allowsMultiple}
          onSelect={(fileList) => {
            if (fileList) accept([...fileList]);
          }}
        >
          {/* `FileTrigger` wires its click through React Aria's `PressResponder`
              context, which only a press-aware component (RAC's own `Button`,
              not a plain `<span>`) actually picks up. */}
          <Button className="text-primary underline-offset-4 outline-none data-focus-visible:underline data-hovered:underline">
            browse
          </Button>
        </FileTrigger>
      </Text>
    </DropZone>
  );
}

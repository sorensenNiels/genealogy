import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ImgHTMLAttributes,
} from "react";

import { cn } from "../lib/utils";

type ImageStatus = "loading" | "loaded" | "error";

interface AvatarContextValue {
  status: ImageStatus;
  setStatus: (status: ImageStatus) => void;
}

// No headless primitive backs this one (same category as Card/Input/Table) —
// image-load status just needs to be shared between the two subcomponents so
// the fallback shows while loading and on error, and hides once loaded.
const AvatarContext = createContext<AvatarContextValue | null>(null);

export function Avatar({ className, ...props }: ComponentProps<"span">) {
  const [status, setStatus] = useState<ImageStatus>("loading");
  const contextValue = useMemo(() => ({ status, setStatus }), [status]);
  return (
    <AvatarContext.Provider value={contextValue}>
      <span
        data-slot="avatar"
        className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)}
        {...props}
      />
    </AvatarContext.Provider>
  );
}

export function AvatarImage({
  className,
  alt,
  onLoad,
  onError,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & { alt: string }) {
  const ctx = useContext(AvatarContext);
  if (ctx?.status === "error") return null;

  return (
    <img
      data-slot="avatar-image"
      alt={alt}
      className={cn("aspect-square size-full object-cover", className)}
      onLoad={(event) => {
        ctx?.setStatus("loaded");
        onLoad?.(event);
      }}
      onError={(event) => {
        ctx?.setStatus("error");
        onError?.(event);
      }}
      {...props}
    />
  );
}

export function AvatarFallback({ className, ...props }: ComponentProps<"span">) {
  const ctx = useContext(AvatarContext);
  if (ctx?.status === "loaded") return null;

  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

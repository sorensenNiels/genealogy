import type { ReactNode } from "react";
import { Switch as RACSwitch, type SwitchProps as RACSwitchProps } from "react-aria-components";

import { useReadOnly } from "../lib/read-only";
import { cn } from "../lib/utils";

export function Switch({
  className,
  children,
  ...props
}: Omit<RACSwitchProps, "children" | "className"> & { className?: string; children?: ReactNode }) {
  const isReadOnly = useReadOnly();
  return (
    <RACSwitch
      {...(isReadOnly ? { isReadOnly: true } : {})}
      data-slot="switch"
      className={cn(
        "group inline-flex items-center gap-2 text-sm data-disabled:cursor-not-allowed data-disabled:opacity-50",
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    >
      <div className="flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input px-px transition-colors group-data-focus-visible:ring-[3px] group-data-focus-visible:ring-ring/50 group-data-selected:bg-primary">
        <span className="size-4 rounded-full bg-background shadow-xs transition-transform group-data-selected:translate-x-full" />
      </div>
      {children}
    </RACSwitch>
  );
}

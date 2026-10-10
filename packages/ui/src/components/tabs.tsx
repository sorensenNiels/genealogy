import type { ReactNode } from "react";

import { Tabs as TabsRoot, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean | undefined;
}

export interface TabsProps<V extends string = string> {
  tabs: readonly TabItem<V>[];
  /** Controlled selection; leave out (and use `defaultValue`) to let Tabs own it. */
  value?: V | undefined;
  defaultValue?: V | undefined;
  onValueChange?: ((value: V) => void) | undefined;
  /** Names the tab list for screen readers — there's no visible heading for it. */
  "aria-label": string;
  variant?: "default" | "line" | undefined;
  className?: string | undefined;
}

/**
 * Tabs from a list of `{ value, label, content }` — the list and its panels
 * are built from the same array, so a tab can't lose its panel or the other
 * way round. Only the active panel is mounted (Base UI's default), so a
 * panel's queries don't run until it's shown.
 */
export function Tabs<V extends string = string>({
  tabs,
  value,
  defaultValue = tabs[0]?.value,
  onValueChange,
  "aria-label": ariaLabel,
  variant,
  className,
}: TabsProps<V>) {
  return (
    <TabsRoot
      {...(value === undefined ? { defaultValue } : { value })}
      onValueChange={(next) => onValueChange?.(next as V)}
      className={className}
    >
      <TabsList aria-label={ariaLabel} variant={variant}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}

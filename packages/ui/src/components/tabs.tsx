import {
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs as RACTabs,
  type TabListProps,
  type TabPanelProps,
  type TabPanelsProps,
  type TabProps,
  type TabsProps,
} from "react-aria-components";

import { cn } from "../lib/utils";

export function Tabs({ className, ...props }: TabsProps) {
  return (
    <RACTabs
      data-slot="tabs"
      className={cn("flex flex-col gap-2", typeof className === "string" ? className : undefined)}
      {...props}
    />
  );
}

export function TabsList<T extends object>({ className, ...props }: TabListProps<T>) {
  return (
    <TabList
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabProps) {
  return (
    <Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none data-disabled:pointer-events-none data-disabled:opacity-50 data-focus-visible:ring-[3px] data-focus-visible:ring-ring/50 data-selected:bg-background data-selected:text-foreground data-selected:shadow-sm",
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  );
}

/**
 * React Aria requires every `TabsContent` to live inside one collection
 * container — unlike shadcn's Radix-based Tabs, which lets each content panel
 * stand alone. Wrap all of a `Tabs`'s `TabsContent` children in this once.
 */
export function TabsPanels<T extends object>(props: TabPanelsProps<T>) {
  return <TabPanels {...props} />;
}

export function TabsContent({ className, ...props }: TabPanelProps) {
  return (
    <TabPanel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none data-focus-visible:ring-[3px] data-focus-visible:ring-ring/50",
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  );
}

import { Button } from "@genealogy/ui/components/button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { DatabaseBackupIcon } from "lucide-react";

import { createBackup } from "../server/functions/backup.functions";

const TOOLS = ["backup"] as const;
type Tool = (typeof TOOLS)[number];

const TOOL_LABELS: Record<Tool, string> = {
  backup: "Backup database",
};

export const Route = createFileRoute("/tools")({
  validateSearch: (search: Record<string, unknown>): { tool?: Tool } => {
    const tool = TOOLS.find((option) => option === search.tool);
    return tool ? { tool } : {};
  },
  component: ToolsRoute,
});

function ToolsRoute() {
  const { tool = TOOLS[0] } = useSearch({ from: "/tools" });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tools</h1>
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <SectionCard title="Tools" titleClassName="text-base" className="h-fit">
          <nav className="flex flex-col gap-1">
            {TOOLS.map((option) => (
              <Link
                key={option}
                to="/tools"
                search={{ tool: option }}
                className={cn(
                  "rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  option === tool && "border-primary bg-accent font-medium text-foreground",
                )}
              >
                {TOOL_LABELS[option]}
              </Link>
            ))}
          </nav>
        </SectionCard>
        {tool === "backup" && <BackupPanel />}
      </div>
    </div>
  );
}

function BackupPanel() {
  // Generating the dump is a queued BullMQ job (see TECH_STACK.md's
  // "Long-running work" section), not something this request waits on —
  // this just kicks it off, and the notification bell is what tells the
  // user their file is ready.
  const createBackupMutation = useMutation({ mutationFn: createBackup });

  return (
    <SectionCard title={TOOL_LABELS.backup}>
      <p className="text-sm text-muted-foreground">
        Generates a gzipped SQL dump of the whole database — people, sources, citations, and the
        family tree graph — in one file. Restore it with{" "}
        <code className="font-mono text-xs">
          gunzip -c &lt;file&gt; | psql &lt;connection-string&gt;
        </code>
        . You'll get a notification (top right) once it's ready to download.
      </p>
      <div className="mt-4">
        <Button
          isDisabled={createBackupMutation.isPending}
          onPress={() => createBackupMutation.mutate()}
        >
          <DatabaseBackupIcon className="size-4" aria-hidden="true" />
          {createBackupMutation.isPending ? "Starting…" : "Start backup"}
        </Button>
        {createBackupMutation.isSuccess && (
          <p className="mt-2 text-sm text-muted-foreground">
            Queued — this can take a little while for a large tree.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

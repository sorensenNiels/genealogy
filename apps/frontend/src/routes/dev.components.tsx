import { resolveHistoricalDate } from "@genealogy/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@genealogy/ui/components/alert-dialog";
import { Autocomplete } from "@genealogy/ui/components/autocomplete";
import { Avatar, AvatarFallback, AvatarImage } from "@genealogy/ui/components/avatar";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@genealogy/ui/components/card";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
} from "@genealogy/ui/components/combobox";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@genealogy/ui/components/dialog";
import { HistoricalDateInput } from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { Popover, PopoverContent } from "@genealogy/ui/components/popover";
import { SaveButton } from "@genealogy/ui/components/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genealogy/ui/components/select";
import { Separator } from "@genealogy/ui/components/separator";
import { Switch } from "@genealogy/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@genealogy/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsPanels,
  TabsTrigger,
} from "@genealogy/ui/components/tabs";
import { ThemeToggle } from "@genealogy/ui/components/theme-toggle";
import { Tooltip, TooltipContent } from "@genealogy/ui/components/tooltip";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

// Not linked from the main nav — a dev-only reference for checking every
// packages/ui component (and both themes) at a glance. Every new component
// added to the package should get a section here.
export const Route = createFileRoute("/dev/components")({
  component: ComponentsShowcase,
});

const SAMPLE_PEOPLE = [
  { id: "1", name: "Anne Marie Sørensen" },
  { id: "2", name: "Niels Sørensen" },
  { id: "3", name: "Karen Sørensen" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b pb-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

function HistoricalDateDemo({ label, initialValue }: { label: string; initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const resolved = trimmed === "" ? null : resolveHistoricalDate(trimmed);
  const preview =
    resolved === null
      ? null
      : resolved.display
        ? { text: resolved.display, status: "parsed" as const }
        : { text: value, status: "unparsed" as const };

  return (
    <div className="w-56 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <HistoricalDateInput value={value} onChange={setValue} preview={preview} />
    </div>
  );
}

function ComponentsShowcase() {
  const [query, setQuery] = useState("");
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [titlePrefix, setTitlePrefix] = useState("");
  const [suffix, setSuffix] = useState("Jr.");
  const [notes, setNotes] = useState("Known as **Grandpa Joe** — served in the *merchant navy*.");

  const options = SAMPLE_PEOPLE.filter((person) =>
    person.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Component showcase</h1>
          <p className="text-sm text-muted-foreground">
            Every packages/ui component, for checking both themes at a glance.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <Section title="Button">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button isDisabled>Disabled</Button>
      </Section>

      <Section title="Save Button">
        <SaveButton isDirty={false} isPending={false}>
          Save
        </SaveButton>
        <SaveButton isDirty isPending={false}>
          Save
        </SaveButton>
        <SaveButton isDirty={false} isPending>
          Save
        </SaveButton>
      </Section>

      <Section title="Badge">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
      </Section>

      <Section title="Card">
        <Card className="w-72">
          <CardHeader>
            <CardTitle>Karen Sørensen</CardTitle>
            <CardDescription>1928–2004</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Born in Aarhus, Denmark.
          </CardContent>
        </Card>
      </Section>

      <Section title="Input">
        <Input placeholder="First names" className="max-w-56" />
      </Section>

      <Section title="Copyable Text">
        <CopyableText value="LZ4Y-9K2" />
      </Section>

      <Section title="Markdown Editor">
        <div className="w-full max-w-md space-y-1">
          <p className="text-xs text-muted-foreground">Editing</p>
          <MarkdownEditor aria-label="Notes" value={notes} onChange={setNotes} />
        </div>
        <div className="w-full max-w-md space-y-1">
          <p className="text-xs text-muted-foreground">Rendered (MarkdownContent)</p>
          <div className="rounded-md border p-3">
            <MarkdownContent>{notes}</MarkdownContent>
          </div>
        </div>
      </Section>

      <Section title="Historical Date Input">
        <HistoricalDateDemo label="Exact" initialValue="12 MAR 1901" />
        <HistoricalDateDemo label="Approximate" initialValue="abt 1854" />
        <HistoricalDateDemo label="Before" initialValue="bef 1920" />
        <HistoricalDateDemo label="Range" initialValue="BET 1850 AND 1860" />
        <HistoricalDateDemo label="Unreadable" initialValue="sometime in the war" />
      </Section>

      <Section title="Autocomplete">
        <div className="w-56 space-y-1">
          <p className="text-xs text-muted-foreground">Title / prefix</p>
          <Autocomplete
            aria-label="Title / prefix"
            placeholder="e.g. Dr., Rev."
            value={titlePrefix}
            onChange={setTitlePrefix}
            options={["Mr.", "Mrs.", "Miss", "Ms.", "Dr.", "Rev.", "Prof.", "Sir"]}
          />
        </div>
        <div className="w-56 space-y-1">
          <p className="text-xs text-muted-foreground">Clearable</p>
          <Autocomplete
            aria-label="Clearable suffix example"
            placeholder="e.g. Jr., III"
            value={suffix}
            onChange={setSuffix}
            options={["Jr.", "Sr.", "II", "III", "IV"]}
            isClearable
          />
        </div>
      </Section>

      <Section title="Switch">
        <Switch isSelected={switchOn} onChange={setSwitchOn}>
          Living
        </Switch>
      </Section>

      <Section title="Checkbox">
        <Checkbox isSelected={checked} onChange={setChecked}>
          Notify me
        </Checkbox>
      </Section>

      <Section title="Separator">
        <div className="w-56 space-y-2">
          <p className="text-sm">Above</p>
          <Separator />
          <p className="text-sm">Below</p>
        </div>
      </Section>

      <Section title="Avatar">
        <Avatar>
          <AvatarImage src="/does-not-exist.png" alt="" />
          <AvatarFallback>AS</AvatarFallback>
        </Avatar>
      </Section>

      <Section title="Tooltip">
        <Tooltip>
          <Button variant="outline">Hover me</Button>
          <TooltipContent>A helpful hint</TooltipContent>
        </Tooltip>
      </Section>

      <Section title="Tabs">
        <Tabs defaultSelectedKey="details" className="w-72">
          <TabsList aria-label="Person">
            <TabsTrigger id="details">Details</TabsTrigger>
            <TabsTrigger id="sources">Sources</TabsTrigger>
          </TabsList>
          <TabsPanels>
            <TabsContent id="details">First/last names, dates, notes.</TabsContent>
            <TabsContent id="sources">Citations will show here.</TabsContent>
          </TabsPanels>
        </Tabs>
      </Section>

      <Section title="Select">
        <Select aria-label="Sex" defaultValue="U">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem id="M">M</SelectItem>
            <SelectItem id="F">F</SelectItem>
            <SelectItem id="U">U</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section title="Popover">
        <Popover>
          <Button variant="outline">Open popover</Button>
          <PopoverContent>This is a popover, animated on entry and exit.</PopoverContent>
        </Popover>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <Button variant="outline">Open dialog</Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Example dialog</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Dialog body content.</p>
            <DialogFooter>
              <Button slot="close">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Alert dialog">
        <AlertDialog>
          <Button variant="destructive">Delete…</Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this record?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. Body text explains what will happen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Section>

      <Section title="Combobox">
        <Combobox<(typeof SAMPLE_PEOPLE)[number]>
          aria-label="Search people"
          items={options}
          inputValue={query}
          onInputChange={setQuery}
        >
          <ComboboxInput placeholder="Search people…" />
          <ComboboxContent<(typeof SAMPLE_PEOPLE)[number]>
            renderEmptyState={() => <ComboboxEmpty>No matches.</ComboboxEmpty>}
          >
            {(item) => <ComboboxItem id={item.id}>{item.name}</ComboboxItem>}
          </ComboboxContent>
        </Combobox>
      </Section>

      <Section title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sex</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_PEOPLE.map((person) => (
              <TableRow key={person.id}>
                <TableCell>{person.name}</TableCell>
                <TableCell>F</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}

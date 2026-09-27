import {
  joinHistoricalDateText,
  resolveHistoricalDate,
  splitHistoricalDateText,
} from "@genealogy/core";
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
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { Calendar } from "@genealogy/ui/components/calendar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@genealogy/ui/components/dropdown-menu";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import {
  HistoricalDateInput,
  type HistoricalDateQuality,
} from "@genealogy/ui/components/historical-date-input";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { Popover, PopoverContent } from "@genealogy/ui/components/popover";
import { ProgressBar } from "@genealogy/ui/components/progress-bar";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
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
import { LogOutIcon, PlusIcon, UserIcon } from "lucide-react";
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
  const initialSplit = splitHistoricalDateText(initialValue);
  const [quality, setQuality] = useState<HistoricalDateQuality>(initialSplit.quality);
  const [value, setValue] = useState(initialSplit.value);
  const [endValue, setEndValue] = useState(initialSplit.endValue);

  const joined = joinHistoricalDateText({ quality, value, endValue });
  const resolved = joined === null ? null : resolveHistoricalDate(joined);
  const preview =
    resolved === null
      ? null
      : resolved.display
        ? { text: resolved.display, status: "parsed" as const }
        : { text: joined ?? "", status: "unparsed" as const };

  return (
    <div className="w-56 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <HistoricalDateInput
        quality={quality}
        onQualityChange={setQuality}
        value={value}
        onChange={setValue}
        endValue={endValue}
        onEndChange={setEndValue}
        preview={preview}
      />
    </div>
  );
}

/** No `quality`/`onQualityChange` passed — always "Exact", no dropdown. Used by the People list's Born after/before filters. */
function NoQualifierDateDemo({ label, initialValue }: { label: string; initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const resolved = value.trim() === "" ? null : resolveHistoricalDate(value);
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

function ButtonRadioGroupDemo() {
  const [gender, setGender] = useState<"M" | "F" | "U">("U");
  return (
    <ButtonRadioGroup
      aria-label="Gender"
      value={gender}
      onChange={setGender}
      options={[
        { value: "M", label: "Male" },
        { value: "F", label: "Female" },
        { value: "U", label: "Unknown" },
      ]}
    />
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

      <Section title="Button Radio Group">
        <ButtonRadioGroupDemo />
      </Section>

      <Section title="Progress Bar">
        <ProgressBar label="Research completeness" value={20} className="max-w-56" />
        <ProgressBar label="Research completeness" value={78} className="max-w-56" />
        <ProgressBar label="Research completeness" value={100} className="max-w-56" />
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

      <Section title="Section Card">
        <SectionCard title="Karen Sørensen" description="1928–2004" className="w-72">
          <p className="text-sm text-muted-foreground">Born in Aarhus, Denmark.</p>
        </SectionCard>
        <SectionCard
          title="Sources & citations"
          titleClassName="text-base"
          className="w-72"
          action={
            <Button variant="outline" size="icon" aria-label="Add citation">
              <PlusIcon className="size-4" />
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">No citations recorded yet.</p>
        </SectionCard>
        <SectionCard
          title="Birth"
          className="w-72"
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline">Cancel</Button>
              <SaveButton isDirty isPending={false}>
                Save
              </SaveButton>
            </div>
          }
        >
          <p className="text-sm text-muted-foreground">Form fields go here.</p>
        </SectionCard>
      </Section>

      <Section title="Input">
        <Input placeholder="First names" className="max-w-56" />
      </Section>

      <Section title="Labeled Field">
        <LabeledField label="First names" className="max-w-56">
          <Input placeholder="First names" />
        </LabeledField>
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
        <NoQualifierDateDemo label="No qualifier (filter use)" initialValue="1900" />
      </Section>

      <Section title="Calendar">
        <Calendar aria-label="Date" />
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
        <Select aria-label="Gender" defaultValue="U">
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

      <Section title="Dropdown Menu">
        <DropdownMenu>
          <Button variant="outline">Open menu</Button>
          <DropdownMenuContent
            header={
              <DropdownMenuLabel className="mb-1 border-b font-normal text-muted-foreground">
                anne@example.com
              </DropdownMenuLabel>
            }
          >
            <DropdownMenuItem>
              <UserIcon className="size-4" aria-hidden="true" />
              Profile settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon className="size-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

      <Section title="Form Dialog">
        <FormDialog
          trigger={<Button variant="outline">+ Add citation</Button>}
          title="Add citation"
        >
          {(close) => (
            <>
              <p className="text-sm text-muted-foreground">Form fields go here.</p>
              <DialogFooter>
                <Button onPress={close}>Save</Button>
              </DialogFooter>
            </>
          )}
        </FormDialog>
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

      <Section title="Remove Button">
        <RemoveButton itemLabel="this citation" onConfirm={() => {}} />
        <RemoveButton
          itemLabel="Karen Sørensen"
          title="Delete Karen Sørensen?"
          description="This permanently removes them and everything recorded about them. This cannot be undone."
          actionLabel="Delete"
          onConfirm={() => {}}
          trigger={<Button variant="destructive">Delete…</Button>}
        />
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
              <TableHead>Gender</TableHead>
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

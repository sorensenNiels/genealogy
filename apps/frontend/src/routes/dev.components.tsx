import {
  isAdmin,
  joinHistoricalDateText,
  paginate,
  resolveHistoricalDate,
  splitHistoricalDateText,
} from "@genealogy/core";
import { AddButton } from "@genealogy/ui/components/add-button";
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
import { CardRadioGroup } from "@genealogy/ui/components/card-radio-group";
import { Checkbox } from "@genealogy/ui/components/checkbox";
import { ColorSwatchPicker } from "@genealogy/ui/components/color-swatch-picker";
import { Combobox } from "@genealogy/ui/components/combobox";
import { ConfirmDialog } from "@genealogy/ui/components/confirm-dialog";
import { CopyableText } from "@genealogy/ui/components/copyable-text";
import { Dialog, DialogClose, DialogFooter } from "@genealogy/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@genealogy/ui/components/dropdown-menu";
import { FaceBoxOverlay, type FaceBox } from "@genealogy/ui/components/face-box-overlay";
import { FileDropZone } from "@genealogy/ui/components/file-drop-zone";
import { FormDialog } from "@genealogy/ui/components/form-dialog";
import {
  HistoricalDateInput,
  type HistoricalDateQuality,
} from "@genealogy/ui/components/historical-date-input";
import { IconButton } from "@genealogy/ui/components/icon-button";
import { ImageCropDialog } from "@genealogy/ui/components/image-crop-dialog";
import { ImageViewer } from "@genealogy/ui/components/image-viewer";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { MarkdownContent } from "@genealogy/ui/components/markdown-content";
import { MarkdownEditor } from "@genealogy/ui/components/markdown-editor";
import { PhotoBook, type PhotoBookPage } from "@genealogy/ui/components/photo-book";
import { PhotoGrid, type Selection } from "@genealogy/ui/components/photo-grid";
import { Popover } from "@genealogy/ui/components/popover";
import { ProgressBar } from "@genealogy/ui/components/progress-bar";
import { RemoveButton } from "@genealogy/ui/components/remove-button";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { SectionCard } from "@genealogy/ui/components/section-card";
import { Select } from "@genealogy/ui/components/select";
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
import { Tabs } from "@genealogy/ui/components/tabs";
import { TagInput } from "@genealogy/ui/components/tag-input";
import { ThemeToggle } from "@genealogy/ui/components/theme-toggle";
import { Tooltip } from "@genealogy/ui/components/tooltip";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LogOutIcon, PencilIcon, PlusIcon, UserIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useIsLocalhost } from "../lib/localhost";

// A development tool, linked from the Tools page's "Development tools"
// section on localhost only: every packages/ui component (and both themes)
// at a glance. Every new component added to the package should get a
// section here.

export const Route = createFileRoute("/dev/components")({
  // Admin-only like the Tools page it's linked from.
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.role)) throw redirect({ to: "/" });
  },
  component: DevComponentsRoute,
});

function DevComponentsRoute() {
  const { t } = useTranslation();
  const isLocalhost = useIsLocalhost();
  // Unknown until mounted (see useIsLocalhost) — render nothing rather than
  // flash the "localhost only" notice on the very machine it's meant for.
  if (isLocalhost === null) return null;
  if (!isLocalhost)
    return <p className="text-sm text-muted-foreground">{t("tools.devOnlyLocalhost")}</p>;
  return <ComponentsShowcase />;
}

const SAMPLE_PEOPLE = [
  { id: "1", name: "Anne Marie Sørensen" },
  { id: "2", name: "Niels Sørensen" },
  { id: "3", name: "Karen Sørensen" },
];

/** A flat placeholder rectangle — avoids depending on a real photo (or network access) just to demo FaceBoxOverlay/ImageViewer. */
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='100%25' height='100%25' fill='%23cbd5e1'/%3E%3C/svg%3E";

const SAMPLE_FACE_BOXES: FaceBox[] = [
  {
    id: "1",
    left: 0.12,
    top: 0.18,
    width: 0.18,
    height: 0.24,
    label: "Karen Sørensen",
    state: "linked",
  },
  { id: "2", left: 0.55, top: 0.2, width: 0.18, height: 0.24, state: "untagged" },
  { id: "3", left: 0.35, top: 0.55, width: 0.16, height: 0.22, state: "unknown" },
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

function CardRadioGroupDemo() {
  const [layout, setLayout] = useState<"compact" | "detailed" | "photos">("detailed");
  return (
    <CardRadioGroup
      aria-label="Layout"
      className="w-full max-w-2xl"
      value={layout}
      onValueChange={setLayout}
      options={[
        {
          value: "compact",
          label: "Compact",
          description: "Names and years",
          preview: <span className="block h-16 bg-muted" />,
        },
        {
          value: "detailed",
          label: "Detailed",
          description: "Dates and places",
          preview: <span className="block h-16 bg-accent" />,
        },
        {
          value: "photos",
          label: "With photos",
          description: "A portrait on each card",
          preview: <span className="block h-16 bg-primary/20" />,
        },
      ]}
    />
  );
}

function ButtonRadioGroupDemo() {
  const [gender, setGender] = useState<"M" | "F" | "U">("U");
  return (
    <ButtonRadioGroup
      aria-label="Gender"
      value={gender}
      onValueChange={setGender}
      options={[
        { value: "M", label: "Male" },
        { value: "F", label: "Female" },
        { value: "U", label: "Unknown" },
      ]}
    />
  );
}

function ColorSwatchPickerDemo() {
  const [color, setColor] = useState("#2f4034");
  return (
    <ColorSwatchPicker
      aria-label="Cover colour"
      value={color}
      onValueChange={setColor}
      colors={["#2f4034", "#6b2b2b", "#4a3322", "#23344a", "#e3dccb", "#3b3b3f"]}
    />
  );
}

function ImageViewerDemo() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        Open image viewer
      </Button>
      <ImageViewer
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Family photo, 1962"
        onPrevious={() => {}}
        onNext={() => {}}
      >
        <img src={PLACEHOLDER_IMAGE} alt="Family, 1962" />
      </ImageViewer>
    </>
  );
}

function ImageCropDialogDemo() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        Open cropper
      </Button>
      <ImageCropDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        imageSrc={PLACEHOLDER_IMAGE}
        onCropped={() => setIsOpen(false)}
      />
    </>
  );
}

const PHOTO_GRID_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa"];

function PhotoGridDemo() {
  const [items, setItems] = useState(
    PHOTO_GRID_COLORS.map((color, index) => ({ id: `swatch-${index}`, color })),
  );
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());

  return (
    <div className="max-w-md space-y-2">
      <PhotoGrid
        aria-label="Sample photos"
        items={items}
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        onItemAction={(id) => alert(`Opening ${id}`)}
        onReorder={(orderedIds) => {
          const byId = new Map(items.map((item) => [item.id, item]));
          setItems(orderedIds.map((id) => byId.get(id)!));
        }}
      >
        {(item) => <div className="size-full" style={{ backgroundColor: item.color }} />}
      </PhotoGrid>
      <p className="text-xs text-muted-foreground">
        Drag the handle to reorder, or use the checkbox to multi-select.
      </p>
    </div>
  );
}

const BOOK_PHOTO_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa"];

function demoCover(label: string, tone: string) {
  return (
    <div
      className="flex size-full items-center justify-center rounded-r-sm"
      style={{ background: tone }}
    >
      <span className="px-4 text-center font-serif text-lg text-white">{label}</span>
    </div>
  );
}

function PhotoBookDemo() {
  const [physicalOpen, setPhysicalOpen] = useState(false);
  const [virtualOpen, setVirtualOpen] = useState(false);

  const photoIds = BOOK_PHOTO_COLORS.map((color, index) => ({ id: `book-photo-${index}`, color }));
  const pages: PhotoBookPage[] = paginate(photoIds, 2).map((group, pageIndex) => ({
    id: `page-${pageIndex}`,
    photos: group.map((photo) => ({
      id: photo.id,
      src: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='100%25' height='100%25' fill='${encodeURIComponent(photo.color)}'/%3E%3C/svg%3E`,
      alt: "Sample photo",
      caption: "A sample caption",
    })),
  }));
  const virtualPages: PhotoBookPage[] = pages.map((page) => ({
    ...page,
    photos: page.photos.map((photo) => ({
      ...photo,
      sourceLabel: "FYS-001 · Sample physical album, p. 2",
    })),
  }));

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setPhysicalOpen(true)}>
        Open physical-style book
      </Button>
      <PhotoBook
        open={physicalOpen}
        onOpenChange={setPhysicalOpen}
        title="Mormor Else's album"
        coverNode={demoCover("Mormor Else's album", "#2f4034")}
        insideCoverNode={demoCover("Physical album", "#1d1c1a")}
        pages={pages}
        paperStyle="black"
      />
      <Button variant="outline" onClick={() => setVirtualOpen(true)}>
        Open virtual-style book
      </Button>
      <PhotoBook
        open={virtualOpen}
        onOpenChange={setVirtualOpen}
        title="Christmas through the years"
        coverNode={demoCover("Christmas through the years", "#e9ece8")}
        insideCoverNode={demoCover("Virtual album", "#f4f3ef")}
        pages={virtualPages}
        paperStyle="modern"
      />
    </div>
  );
}

function ComponentsShowcase() {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [gender, setGender] = useState<"M" | "F" | "U">("U");
  const [source, setSource] = useState<string | null>(null);
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [titlePrefix, setTitlePrefix] = useState("");
  const [suffix, setSuffix] = useState("Jr.");
  const [demoTags, setDemoTags] = useState<string[]>(["Scanned", "1970s"]);
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
        <Button disabled>Disabled</Button>
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

      <Section title="Card Radio Group">
        <CardRadioGroupDemo />
      </Section>

      <Section title="Button Radio Group">
        <ButtonRadioGroupDemo />
      </Section>

      <Section title="Progress Bar">
        <ProgressBar label="Research completeness" value={20} className="max-w-56" />
        <ProgressBar label="Research completeness" value={78} className="max-w-56" />
        <ProgressBar label="Research completeness" value={100} className="max-w-56" />
      </Section>

      <Section title="File Drop Zone">
        <FileDropZone onFilesSelected={() => {}} acceptedFileTypes={["image/*"]} className="w-80" />
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
            onValueChange={setTitlePrefix}
            options={["Mr.", "Mrs.", "Miss", "Ms.", "Dr.", "Rev.", "Prof.", "Sir"]}
          />
        </div>
        <div className="w-56 space-y-1">
          <p className="text-xs text-muted-foreground">Clearable</p>
          <Autocomplete
            aria-label="Clearable suffix example"
            placeholder="e.g. Jr., III"
            value={suffix}
            onValueChange={setSuffix}
            options={["Jr.", "Sr.", "II", "III", "IV"]}
            clearable
          />
        </div>
      </Section>

      <Section title="Tag input">
        <div className="w-72 space-y-1">
          <p className="text-xs text-muted-foreground">Album tags</p>
          <TagInput
            value={demoTags}
            onChange={setDemoTags}
            suggestions={["Scanned", "1970s", "iPhone import", "Family reunion", "Wedding"]}
          />
        </div>
      </Section>

      <Section title="Switch">
        <Switch checked={switchOn} onCheckedChange={setSwitchOn}>
          Living
        </Switch>
        <Switch description="Shown under the label, and read out with the switch.">
          With a description
        </Switch>
      </Section>

      <Section title="Checkbox">
        <Checkbox checked={checked} onCheckedChange={setChecked}>
          Notify me
        </Checkbox>
      </Section>

      <Section title="Color Swatch Picker">
        <ColorSwatchPickerDemo />
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

      <Section title="Face Box Overlay">
        <FaceBoxOverlay
          src={PLACEHOLDER_IMAGE}
          alt="Family, 1962"
          boxes={SAMPLE_FACE_BOXES}
          onUnlinkPress={(id) => alert(`Unlink ${id}`)}
          className="max-w-md"
        />
      </Section>

      <Section title="Image Viewer">
        <ImageViewerDemo />
      </Section>

      <Section title="Image Crop Dialog">
        <ImageCropDialogDemo />
      </Section>

      <Section title="Photo Grid">
        <PhotoGridDemo />
      </Section>

      <Section title="Photo Book">
        <PhotoBookDemo />
      </Section>

      <Section title="Tooltip">
        <Tooltip content="A helpful hint">
          <Button variant="outline">Hover me</Button>
        </Tooltip>
      </Section>

      <Section title="Icon Button">
        <IconButton label="Edit name" icon={<PencilIcon />} />
        <IconButton label="Edit name" icon={<PencilIcon />} variant="outline" />
        <IconButton label="Close" icon={<XIcon />} tooltip={false} />
      </Section>

      <Section title="Add Button">
        <AddButton label="Add a parent" />
        <FormDialog trigger={<AddButton label="Add a citation" />} title="Add a citation">
          {(close) => (
            <DialogFooter>
              <Button onClick={close}>Save</Button>
            </DialogFooter>
          )}
        </FormDialog>
      </Section>

      <Section title="Tabs">
        <Tabs
          aria-label="Person"
          className="w-72"
          tabs={[
            { value: "details", label: "Details", content: "First/last names, dates, notes." },
            { value: "sources", label: "Sources", content: "Citations will show here." },
          ]}
        />
      </Section>

      <Section title="Select">
        <Select
          aria-label="Gender"
          value={gender}
          onValueChange={setGender}
          options={[
            { value: "M", label: "Male" },
            { value: "F", label: "Female" },
            { value: "U", label: "Unknown" },
          ]}
        />
        <Select
          aria-label="Source"
          value={source}
          onValueChange={setSource}
          placeholder="Choose a source"
          className="w-56"
          options={[
            { value: "census-1880", label: "Folketælling 1880, Ribe" },
            { value: "church-1850", label: "Kirkebog, Ribe Domsogn 1850" },
          ]}
        />
      </Section>

      <Section title="Popover">
        <Popover trigger={<Button variant="outline">Open popover</Button>}>
          This is a popover, animated on entry and exit.
        </Popover>
        <Popover
          trigger={<Button variant="outline">With a title</Button>}
          title="Sources"
          description="Where this date comes from."
        >
          {(close) => (
            <Button size="sm" onClick={close}>
              Got it
            </Button>
          )}
        </Popover>
      </Section>

      <Section title="Dropdown Menu">
        <DropdownMenu
          trigger={<Button variant="outline">Open menu</Button>}
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
          <DropdownMenuItem variant="destructive">
            <LogOutIcon className="size-4" aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenu>
      </Section>

      <Section title="Dialog">
        <Dialog
          trigger={<Button variant="outline">Open dialog</Button>}
          title="Example dialog"
          description="An optional description under the title."
        >
          <p className="text-sm text-muted-foreground">Dialog body content.</p>
          <DialogFooter>
            <DialogClose>Close</DialogClose>
          </DialogFooter>
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
                <Button onClick={close}>Save</Button>
              </DialogFooter>
            </>
          )}
        </FormDialog>
      </Section>

      <Section title="Confirm Dialog">
        <ConfirmDialog
          trigger={<Button variant="destructive">Delete…</Button>}
          title="Delete this record?"
          description="This cannot be undone. Body text explains what will happen."
          confirmLabel="Delete"
          onConfirm={() => {}}
        />
        <ConfirmDialog
          trigger={<Button variant="outline">Mark all deceased…</Button>}
          title="Mark 12 people as deceased?"
          confirmLabel="Mark deceased"
          destructive={false}
          onConfirm={() => {}}
        />
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
        <div className="w-72 space-y-1">
          <Combobox
            aria-label="Search people"
            placeholder="Search people…"
            items={options}
            itemKey={(person) => person.id}
            itemLabel={(person) => person.name}
            inputValue={query}
            onInputValueChange={setQuery}
            onSelect={(person) => setPicked(person.name)}
            emptyText="No matches."
          />
          <p className="text-xs text-muted-foreground">Picked: {picked ?? "—"}</p>
        </div>
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

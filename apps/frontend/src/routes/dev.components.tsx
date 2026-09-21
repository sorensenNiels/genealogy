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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@genealogy/ui/components/dialog";
import { Input } from "@genealogy/ui/components/input";
import { Popover, PopoverContent } from "@genealogy/ui/components/popover";
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

function ComponentsShowcase() {
  const [query, setQuery] = useState("");
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);

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
        <Input placeholder="Given names" className="max-w-56" />
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
            <TabsContent id="details">Given/surname, dates, notes.</TabsContent>
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

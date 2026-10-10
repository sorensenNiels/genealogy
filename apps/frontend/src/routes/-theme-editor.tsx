import {
  BUILT_IN_THEMES,
  cssColorSchema,
  FONTS,
  themeDefinitionSchema,
  type FontKey,
  type ThemeColorToken,
  type ThemeDefinition,
  type ThemeEntry,
} from "@genealogy/core";
import { ButtonRadioGroup } from "@genealogy/ui/components/button-radio-group";
import { DialogFooter } from "@genealogy/ui/components/dialog";
import { Input } from "@genealogy/ui/components/input";
import { LabeledField } from "@genealogy/ui/components/labeled-field";
import { SaveButton } from "@genealogy/ui/components/save-button";
import { Select } from "@genealogy/ui/components/select";
import { Tabs } from "@genealogy/ui/components/tabs";
import { cn } from "@genealogy/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { createTheme, updateTheme } from "../server/functions/theme.functions";
import { ThemeLivePreview } from "./-theme-components";

/** The color tokens in the groups the editor shows them in. */
const TOKEN_GROUPS: { key: string; tokens: ThemeColorToken[] }[] = [
  { key: "page", tokens: ["background", "foreground"] },
  { key: "cards", tokens: ["card", "card-foreground", "popover", "popover-foreground"] },
  { key: "brand", tokens: ["primary", "primary-foreground", "ring"] },
  {
    key: "subtle",
    tokens: [
      "secondary",
      "secondary-foreground",
      "accent",
      "accent-foreground",
      "muted",
      "muted-foreground",
    ],
  },
  { key: "lines", tokens: ["border", "input"] },
  { key: "danger", tokens: ["destructive", "destructive-foreground"] },
];

const RADII = [
  { value: "0", label: "square" },
  { value: "0.375", label: "small" },
  { value: "0.625", label: "medium" },
  { value: "1", label: "large" },
] as const;

/**
 * Any CSS color as `#rrggbb`, for the browser's color picker (which only
 * speaks hex): painted onto a 1×1 canvas and read back. Transparency is
 * dropped — picking a color replaces the value with an opaque one.
 */
function toHex(color: string): string {
  if (typeof document === "undefined") return "#000000";
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!context) return "#000000";
  context.fillStyle = "#000000";
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const invalid = !cssColorSchema.safeParse(value).success;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={label}
        value={toHex(value)}
        onChange={(event) => onChange(event.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          aria-invalid={invalid}
          className="h-7 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FontKey;
  onChange: (value: FontKey) => void;
}) {
  return (
    <LabeledField label={label} asDiv>
      <Select
        aria-label={label}
        value={value}
        onValueChange={onChange}
        className="w-full"
        options={(Object.keys(FONTS) as FontKey[]).map((key) => ({
          value: key,
          label: <span style={{ fontFamily: FONTS[key].stack }}>{FONTS[key].label}</span>,
        }))}
      />
    </LabeledField>
  );
}

/**
 * Create or edit a custom theme: name, a starting point to copy from, fonts,
 * corners and every color for light and dark, with real components previewed
 * in the theme as it's edited. Saving is refused (button disabled) until
 * every color parses — the same rule the server enforces.
 */
export function ThemeEditor({
  theme,
  themes,
  onDone,
}: {
  /** The custom theme to edit; leave out to create one. */
  theme?: ThemeEntry | undefined;
  /** Every theme, to copy from. */
  themes: readonly ThemeEntry[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [initial] = useState<ThemeDefinition>(
    () =>
      theme?.definition ?? {
        ...BUILT_IN_THEMES[0]!.definition,
        name: t("appearance.newThemeName"),
      },
  );
  const [draft, setDraft] = useState<ThemeDefinition>(initial);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const valid = themeDefinitionSchema.safeParse(draft).success;

  const save = useMutation({
    mutationFn: () =>
      theme
        ? updateTheme({ data: { id: theme.id, definition: draft } })
        : createTheme({ data: draft }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["theme"] });
      onDone();
    },
  });

  const setColor = (mode: "light" | "dark", token: ThemeColorToken, value: string) =>
    setDraft((current) => ({ ...current, [mode]: { ...current[mode], [token]: value } }));

  const colorTab = (mode: "light" | "dark") => (
    <div className="space-y-4">
      {TOKEN_GROUPS.map((group) => (
        <fieldset key={group.key} className="space-y-2">
          <legend className="text-sm font-medium">{t(`appearance.group.${group.key}`)}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.tokens.map((token) => (
              <ColorField
                key={token}
                label={t(`appearance.token.${token}`)}
                value={draft[mode][token]}
                onChange={(value) => setColor(mode, token, value)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );

  return (
    <form
      className="grid gap-6 md:grid-cols-[1fr_20rem]"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label={t("appearance.name")}>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </LabeledField>
          <LabeledField label={t("appearance.copyFrom")} asDiv>
            <Select
              aria-label={t("appearance.copyFrom")}
              value={copyFrom}
              placeholder={t("appearance.copyFromPlaceholder")}
              className="w-full"
              onValueChange={(id) => {
                const source = themes.find((entry) => entry.id === id);
                if (!source) return;
                setCopyFrom(id);
                setDraft((current) => ({ ...source.definition, name: current.name }));
              }}
              options={themes.map((entry) => ({ value: entry.id, label: entry.definition.name }))}
            />
          </LabeledField>
          <FontSelect
            label={t("appearance.headingFont")}
            value={draft.fonts.heading}
            onChange={(heading) =>
              setDraft((current) => ({ ...current, fonts: { ...current.fonts, heading } }))
            }
          />
          <FontSelect
            label={t("appearance.bodyFont")}
            value={draft.fonts.body}
            onChange={(body) =>
              setDraft((current) => ({ ...current, fonts: { ...current.fonts, body } }))
            }
          />
        </div>
        <LabeledField label={t("appearance.corners")} asDiv>
          <ButtonRadioGroup
            aria-label={t("appearance.corners")}
            value={String(draft.radius)}
            onValueChange={(radius) =>
              setDraft((current) => ({ ...current, radius: Number(radius) }))
            }
            options={RADII.map((option) => ({
              value: option.value,
              label: t(`appearance.radius.${option.label}`),
            }))}
          />
        </LabeledField>
        <Tabs
          aria-label={t("appearance.colors")}
          tabs={[
            { value: "light", label: t("appearance.light"), content: colorTab("light") },
            { value: "dark", label: t("appearance.dark"), content: colorTab("dark") },
          ]}
        />
      </div>
      <div className="space-y-3 md:sticky md:top-0 md:self-start">
        <p className="text-sm font-medium">{t("appearance.preview")}</p>
        <ThemeLivePreview theme={draft} />
      </div>
      <div className="md:col-span-2">
        {!valid && <p className="mb-2 text-sm text-destructive">{t("appearance.invalid")}</p>}
        {save.isError && <p className="mb-2 text-sm text-destructive">{save.error.message}</p>}
        <DialogFooter className={cn(!valid && "opacity-90")}>
          <SaveButton isDirty={isDirty || !theme} isPending={save.isPending} disabled={!valid}>
            {theme ? t("common.save") : t("appearance.create")}
          </SaveButton>
        </DialogFooter>
      </div>
    </form>
  );
}

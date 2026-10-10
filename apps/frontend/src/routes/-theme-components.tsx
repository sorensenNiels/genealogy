import { FONTS, themeVariables, type ThemeDefinition, type ThemeEntry } from "@genealogy/core";
import { Badge } from "@genealogy/ui/components/badge";
import { Button } from "@genealogy/ui/components/button";
import { CardRadioGroup, type CardRadioOption } from "@genealogy/ui/components/card-radio-group";
import { Input } from "@genealogy/ui/components/input";
import { Switch } from "@genealogy/ui/components/switch";
import { cn } from "@genealogy/ui/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Applies a theme to just this element and what's inside it, by setting the
 * theme's CSS variables inline — every Tailwind color, radius and font in
 * here (`bg-primary`, `rounded-lg`, `font-sans`) resolves against them. The
 * dark scope also gets the `dark` class for the components' `dark:` styles.
 * (Inside a page that's itself in dark mode, a light scope still sees the
 * page's `.dark`, so a few `dark:`-only touches leak in — fine for a preview.)
 */
export function ThemeScope({
  theme,
  mode,
  className,
  children,
}: {
  theme: ThemeDefinition;
  mode: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={themeVariables(theme, mode) as CSSProperties}
      className={cn(
        mode === "dark" && "dark",
        "bg-background font-sans text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A small, purely decorative picture of a theme, light half and dark half:
 * page and card colors, "Aa" in the heading font, a primary and an accent
 * shape. Plain spans only — it's shown inside a radio card, which mustn't
 * contain anything interactive.
 */
export function ThemeSwatches({ theme }: { theme: ThemeDefinition }) {
  return (
    <span className="grid grid-cols-2">
      {(["light", "dark"] as const).map((mode) => (
        <span
          key={mode}
          style={themeVariables(theme, mode) as CSSProperties}
          className="block bg-background p-2.5"
        >
          <span className="block rounded-md border bg-card p-2 text-card-foreground">
            <span
              className="block text-lg leading-none"
              style={{ fontFamily: "var(--app-font-heading)" }}
            >
              Aa
            </span>
            <span className="mt-1.5 flex gap-1">
              <span className="block h-2.5 w-6 rounded-sm bg-primary" />
              <span className="block h-2.5 w-3 rounded-sm bg-accent" />
              <span className="block h-2.5 w-3 rounded-sm bg-muted" />
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** A theme's fonts as shown on its card, e.g. "Fraunces · Literata". */
export function themeFontsLabel(theme: ThemeDefinition): string {
  const heading = FONTS[theme.fonts.heading].label;
  const body = FONTS[theme.fonts.body].label;
  return heading === body ? heading : `${heading} · ${body}`;
}

/**
 * Pick a theme from cards with a preview each. `before` adds options ahead
 * of the themes (the profile's "same as the family site").
 */
export function ThemePicker<T extends string>({
  themes,
  value,
  onValueChange,
  before = [],
  "aria-label": ariaLabel,
}: {
  themes: readonly ThemeEntry[];
  value: T;
  onValueChange: (value: T) => void;
  before?: readonly CardRadioOption<T>[];
  "aria-label": string;
}) {
  const { t } = useTranslation();
  return (
    <CardRadioGroup
      aria-label={ariaLabel}
      value={value}
      onValueChange={onValueChange}
      options={[
        ...before,
        ...themes.map((theme) => ({
          value: theme.id as T,
          label: theme.definition.name,
          description: theme.builtIn
            ? themeFontsLabel(theme.definition)
            : `${t("appearance.custom")} · ${themeFontsLabel(theme.definition)}`,
          preview: <ThemeSwatches theme={theme.definition} />,
        })),
      ]}
    />
  );
}

/** Real components in a theme, light and dark — the editor's live preview. */
export function ThemeLivePreview({ theme }: { theme: ThemeDefinition }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      {(["light", "dark"] as const).map((mode) => (
        <ThemeScope key={mode} theme={theme} mode={mode} className="rounded-lg border p-4">
          <p className="mb-2 text-xs text-muted-foreground uppercase">
            {mode === "light" ? t("appearance.light") : t("appearance.dark")}
          </p>
          <div className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
            <h3 className="text-lg font-semibold">Karen Hansdatter</h3>
            <p className="text-sm">
              {t("appearance.previewText")} <span className="text-muted-foreground">1850–1921</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">{t("appearance.previewPrimary")}</Button>
              <Button size="sm" variant="outline">
                {t("appearance.previewOutline")}
              </Button>
              <Button size="sm" variant="destructive">
                {t("appearance.previewDestructive")}
              </Button>
              <Badge>Ribe</Badge>
            </div>
            <div className="flex items-center gap-3">
              <Input
                readOnly
                value="3 Mar 1850"
                aria-label={t("appearance.previewInput")}
                className="w-36"
              />
              <Switch defaultChecked aria-label={t("appearance.previewSwitch")} />
            </div>
          </div>
        </ThemeScope>
      ))}
    </div>
  );
}

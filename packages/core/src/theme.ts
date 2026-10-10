import { z } from "zod";

/*
 * Themes: a named set of colors (light and dark), two fonts and a corner
 * radius, applied app-wide as CSS custom properties. The five built-ins live
 * here as data; admins add custom ones (stored in the `themes` table). Every
 * value ends up inside a `<style>` element (see `themeToCss`), so the schemas
 * below are deliberately strict: a color must look like a CSS color and
 * nothing else, a font must be one of the bundled ones — no free text ever
 * reaches the stylesheet.
 */

/** The color tokens a theme sets — the same names as the CSS variables in packages/ui/src/styles.css. */
export const THEME_COLOR_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
] as const;
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];

/**
 * A CSS color in one of the forms the editor offers: hex (`#1e5a56`) or a
 * color function (`oklch(0.42 0.12 25)`, `oklch(1 0 0 / 10%)`, `rgb(…)`,
 * `hsl(…)`). Only digits, dots, signs, `%`, `/` and spaces inside the
 * parentheses — so a value can't close the declaration and start another.
 */
export const cssColorSchema = z
  .string()
  .trim()
  .max(64)
  .regex(
    /^(#[0-9a-fA-F]{3,8}|(oklch|oklab|lch|lab|rgb|rgba|hsl|hsla)\([0-9.\s%,/+-]+\))$/,
    "Not a CSS color (use #rrggbb or a function such as oklch(…))",
  );

export const themeColorsSchema = z.object(
  Object.fromEntries(THEME_COLOR_TOKENS.map((token) => [token, cssColorSchema])) as Record<
    ThemeColorToken,
    typeof cssColorSchema
  >,
);
export type ThemeColors = z.infer<typeof themeColorsSchema>;

/**
 * The bundled fonts (self-hosted Fontsource variable fonts, imported in
 * apps/frontend/src/styles.css — keep the two lists in step). A closed,
 * code-tied list rather than a configurable option: each key maps to font
 * files that ship with the app.
 */
export const FONTS = {
  system: {
    label: "System default",
    category: "sans",
    stack: "ui-sans-serif, system-ui, sans-serif",
  },
  inter: {
    label: "Inter",
    category: "sans",
    stack: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
  },
  "source-sans-3": {
    label: "Source Sans 3",
    category: "sans",
    stack: '"Source Sans 3 Variable", ui-sans-serif, system-ui, sans-serif',
  },
  nunito: {
    label: "Nunito",
    category: "sans",
    stack: '"Nunito Variable", ui-sans-serif, system-ui, sans-serif',
  },
  "work-sans": {
    label: "Work Sans",
    category: "sans",
    stack: '"Work Sans Variable", ui-sans-serif, system-ui, sans-serif',
  },
  figtree: {
    label: "Figtree",
    category: "sans",
    stack: '"Figtree Variable", ui-sans-serif, system-ui, sans-serif',
  },
  "atkinson-hyperlegible-next": {
    label: "Atkinson Hyperlegible",
    category: "sans",
    stack: '"Atkinson Hyperlegible Next Variable", ui-sans-serif, system-ui, sans-serif',
  },
  fraunces: {
    label: "Fraunces",
    category: "serif",
    stack: '"Fraunces Variable", ui-serif, Georgia, serif',
  },
  literata: {
    label: "Literata",
    category: "serif",
    stack: '"Literata Variable", ui-serif, Georgia, serif',
  },
  lora: { label: "Lora", category: "serif", stack: '"Lora Variable", ui-serif, Georgia, serif' },
  "source-serif-4": {
    label: "Source Serif 4",
    category: "serif",
    stack: '"Source Serif 4 Variable", ui-serif, Georgia, serif',
  },
  "eb-garamond": {
    label: "EB Garamond",
    category: "serif",
    stack: '"EB Garamond Variable", ui-serif, Georgia, serif',
  },
  "playfair-display": {
    label: "Playfair Display",
    category: "serif",
    stack: '"Playfair Display Variable", ui-serif, Georgia, serif',
  },
} as const satisfies Record<string, { label: string; category: "sans" | "serif"; stack: string }>;
export type FontKey = keyof typeof FONTS;
export const fontKeySchema = z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]);

export const themeDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  fonts: z.object({ body: fontKeySchema, heading: fontKeySchema }),
  /** Corner radius in rem — 0 is square, 1 is very round. */
  radius: z.number().min(0).max(1.5),
  light: themeColorsSchema,
  dark: themeColorsSchema,
});
export type ThemeDefinition = z.infer<typeof themeDefinitionSchema>;

/** A theme as listed for picking: built-ins by their slug, custom ones by uuid. */
export interface ThemeEntry {
  id: string;
  builtIn: boolean;
  definition: ThemeDefinition;
}

export const themeIdSchema = z.string().trim().min(1).max(64);
export const createThemeSchema = themeDefinitionSchema;
export const updateThemeSchema = z.object({ id: z.uuid(), definition: themeDefinitionSchema });

const NOVA: ThemeDefinition = {
  name: "Nova",
  fonts: { body: "system", heading: "system" },
  radius: 0.625,
  light: {
    background: "#f5f5f2",
    foreground: "oklch(0.129 0.042 264.695)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.129 0.042 264.695)",
    popover: "oklch(1 0 0)",
    "popover-foreground": "oklch(0.129 0.042 264.695)",
    primary: "#1e5a56",
    "primary-foreground": "oklch(0.984 0.003 247.858)",
    secondary: "oklch(1 0 0)",
    "secondary-foreground": "oklch(0.208 0.042 265.755)",
    muted: "oklch(0.968 0.007 247.896)",
    "muted-foreground": "oklch(0.554 0.046 257.417)",
    accent: "oklch(0.968 0.007 247.896)",
    "accent-foreground": "oklch(0.208 0.042 265.755)",
    destructive: "oklch(0.577 0.245 27.325)",
    "destructive-foreground": "oklch(0.984 0.003 247.858)",
    border: "oklch(0.929 0.013 255.508)",
    input: "oklch(0.929 0.013 255.508)",
    ring: "oklch(0.704 0.04 256.788)",
  },
  dark: {
    background: "oklch(0.129 0.042 264.695)",
    foreground: "oklch(0.984 0.003 247.858)",
    card: "oklch(0.208 0.042 265.755)",
    "card-foreground": "oklch(0.984 0.003 247.858)",
    popover: "oklch(0.208 0.042 265.755)",
    "popover-foreground": "oklch(0.984 0.003 247.858)",
    primary: "#2f8f86",
    "primary-foreground": "oklch(0.984 0.003 247.858)",
    secondary: "oklch(0.279 0.041 260.031)",
    "secondary-foreground": "oklch(0.984 0.003 247.858)",
    muted: "oklch(0.279 0.041 260.031)",
    "muted-foreground": "oklch(0.704 0.04 256.788)",
    accent: "oklch(0.279 0.041 260.031)",
    "accent-foreground": "oklch(0.984 0.003 247.858)",
    destructive: "oklch(0.704 0.191 22.216)",
    "destructive-foreground": "oklch(0.984 0.003 247.858)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.551 0.027 264.364)",
  },
};

/** Archival and warm: parchment, oxblood, a serif throughout. */
const HERITAGE: ThemeDefinition = {
  name: "Heritage",
  fonts: { body: "literata", heading: "fraunces" },
  radius: 0.375,
  light: {
    background: "oklch(0.972 0.014 85)",
    foreground: "oklch(0.25 0.03 45)",
    card: "oklch(0.99 0.008 85)",
    "card-foreground": "oklch(0.25 0.03 45)",
    popover: "oklch(0.99 0.008 85)",
    "popover-foreground": "oklch(0.25 0.03 45)",
    primary: "oklch(0.42 0.12 25)",
    "primary-foreground": "oklch(0.98 0.01 85)",
    secondary: "oklch(0.94 0.02 80)",
    "secondary-foreground": "oklch(0.3 0.04 45)",
    muted: "oklch(0.94 0.02 80)",
    "muted-foreground": "oklch(0.5 0.04 55)",
    accent: "oklch(0.92 0.035 75)",
    "accent-foreground": "oklch(0.3 0.04 45)",
    destructive: "oklch(0.55 0.2 27)",
    "destructive-foreground": "oklch(0.98 0.01 85)",
    border: "oklch(0.88 0.025 75)",
    input: "oklch(0.88 0.025 75)",
    ring: "oklch(0.6 0.08 40)",
  },
  dark: {
    background: "oklch(0.2 0.02 50)",
    foreground: "oklch(0.93 0.02 80)",
    card: "oklch(0.25 0.02 50)",
    "card-foreground": "oklch(0.93 0.02 80)",
    popover: "oklch(0.25 0.02 50)",
    "popover-foreground": "oklch(0.93 0.02 80)",
    primary: "oklch(0.68 0.13 30)",
    "primary-foreground": "oklch(0.18 0.02 50)",
    secondary: "oklch(0.3 0.02 50)",
    "secondary-foreground": "oklch(0.93 0.02 80)",
    muted: "oklch(0.3 0.02 50)",
    "muted-foreground": "oklch(0.72 0.03 70)",
    accent: "oklch(0.33 0.03 50)",
    "accent-foreground": "oklch(0.93 0.02 80)",
    destructive: "oklch(0.7 0.18 25)",
    "destructive-foreground": "oklch(0.98 0.01 85)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.6 0.08 40)",
  },
};

/** Cool and Nordic: grey-blue surfaces, slate-blue, a crisp sans. */
const FJORD: ThemeDefinition = {
  name: "Fjord",
  fonts: { body: "inter", heading: "inter" },
  radius: 0.375,
  light: {
    background: "oklch(0.975 0.006 240)",
    foreground: "oklch(0.22 0.03 250)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.22 0.03 250)",
    popover: "oklch(1 0 0)",
    "popover-foreground": "oklch(0.22 0.03 250)",
    primary: "oklch(0.48 0.09 245)",
    "primary-foreground": "oklch(0.98 0.005 240)",
    secondary: "oklch(0.95 0.01 240)",
    "secondary-foreground": "oklch(0.28 0.03 250)",
    muted: "oklch(0.95 0.01 240)",
    "muted-foreground": "oklch(0.52 0.03 250)",
    accent: "oklch(0.93 0.02 240)",
    "accent-foreground": "oklch(0.28 0.03 250)",
    destructive: "oklch(0.577 0.245 27.325)",
    "destructive-foreground": "oklch(0.98 0.005 240)",
    border: "oklch(0.9 0.012 240)",
    input: "oklch(0.9 0.012 240)",
    ring: "oklch(0.65 0.06 245)",
  },
  dark: {
    background: "oklch(0.18 0.02 250)",
    foreground: "oklch(0.95 0.008 240)",
    card: "oklch(0.23 0.025 250)",
    "card-foreground": "oklch(0.95 0.008 240)",
    popover: "oklch(0.23 0.025 250)",
    "popover-foreground": "oklch(0.95 0.008 240)",
    primary: "oklch(0.7 0.1 240)",
    "primary-foreground": "oklch(0.18 0.02 250)",
    secondary: "oklch(0.28 0.025 250)",
    "secondary-foreground": "oklch(0.95 0.008 240)",
    muted: "oklch(0.28 0.025 250)",
    "muted-foreground": "oklch(0.72 0.03 245)",
    accent: "oklch(0.28 0.025 250)",
    "accent-foreground": "oklch(0.95 0.008 240)",
    destructive: "oklch(0.704 0.191 22.216)",
    "destructive-foreground": "oklch(0.98 0.005 240)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.55 0.05 245)",
  },
};

/** Soft and friendly: warm off-white, sage green, a rounded sans. */
const MEADOW: ThemeDefinition = {
  name: "Meadow",
  fonts: { body: "nunito", heading: "nunito" },
  radius: 1,
  light: {
    background: "oklch(0.982 0.008 110)",
    foreground: "oklch(0.25 0.03 140)",
    card: "oklch(0.995 0.004 110)",
    "card-foreground": "oklch(0.25 0.03 140)",
    popover: "oklch(0.995 0.004 110)",
    "popover-foreground": "oklch(0.25 0.03 140)",
    primary: "oklch(0.55 0.08 150)",
    "primary-foreground": "oklch(0.985 0.005 110)",
    secondary: "oklch(0.95 0.02 130)",
    "secondary-foreground": "oklch(0.3 0.04 145)",
    muted: "oklch(0.955 0.015 120)",
    "muted-foreground": "oklch(0.52 0.03 140)",
    accent: "oklch(0.93 0.035 135)",
    "accent-foreground": "oklch(0.3 0.04 145)",
    destructive: "oklch(0.6 0.2 25)",
    "destructive-foreground": "oklch(0.985 0.005 110)",
    border: "oklch(0.9 0.02 120)",
    input: "oklch(0.9 0.02 120)",
    ring: "oklch(0.7 0.07 150)",
  },
  dark: {
    background: "oklch(0.2 0.02 150)",
    foreground: "oklch(0.95 0.01 120)",
    card: "oklch(0.25 0.025 150)",
    "card-foreground": "oklch(0.95 0.01 120)",
    popover: "oklch(0.25 0.025 150)",
    "popover-foreground": "oklch(0.95 0.01 120)",
    primary: "oklch(0.72 0.1 150)",
    "primary-foreground": "oklch(0.2 0.02 150)",
    secondary: "oklch(0.3 0.025 150)",
    "secondary-foreground": "oklch(0.95 0.01 120)",
    muted: "oklch(0.3 0.025 150)",
    "muted-foreground": "oklch(0.74 0.03 140)",
    accent: "oklch(0.3 0.025 150)",
    "accent-foreground": "oklch(0.95 0.01 120)",
    destructive: "oklch(0.7 0.18 25)",
    "destructive-foreground": "oklch(0.985 0.005 110)",
    border: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    ring: "oklch(0.6 0.07 150)",
  },
};

/** Editorial and high-contrast: near-monochrome with one red accent, serif, square corners. */
const INK: ThemeDefinition = {
  name: "Ink",
  fonts: { body: "lora", heading: "playfair-display" },
  radius: 0,
  light: {
    background: "oklch(0.99 0 0)",
    foreground: "oklch(0.15 0 0)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.15 0 0)",
    popover: "oklch(1 0 0)",
    "popover-foreground": "oklch(0.15 0 0)",
    primary: "oklch(0.2 0 0)",
    "primary-foreground": "oklch(0.98 0 0)",
    secondary: "oklch(0.96 0 0)",
    "secondary-foreground": "oklch(0.2 0 0)",
    muted: "oklch(0.96 0 0)",
    "muted-foreground": "oklch(0.48 0 0)",
    accent: "oklch(0.95 0.03 25)",
    "accent-foreground": "oklch(0.2 0 0)",
    destructive: "oklch(0.55 0.22 27)",
    "destructive-foreground": "oklch(0.98 0 0)",
    border: "oklch(0.88 0 0)",
    input: "oklch(0.88 0 0)",
    ring: "oklch(0.55 0.2 25)",
  },
  dark: {
    background: "oklch(0.14 0 0)",
    foreground: "oklch(0.96 0 0)",
    card: "oklch(0.18 0 0)",
    "card-foreground": "oklch(0.96 0 0)",
    popover: "oklch(0.18 0 0)",
    "popover-foreground": "oklch(0.96 0 0)",
    primary: "oklch(0.95 0 0)",
    "primary-foreground": "oklch(0.15 0 0)",
    secondary: "oklch(0.24 0 0)",
    "secondary-foreground": "oklch(0.96 0 0)",
    muted: "oklch(0.24 0 0)",
    "muted-foreground": "oklch(0.68 0 0)",
    accent: "oklch(0.26 0.03 25)",
    "accent-foreground": "oklch(0.96 0 0)",
    destructive: "oklch(0.7 0.19 22)",
    "destructive-foreground": "oklch(0.98 0 0)",
    border: "oklch(1 0 0 / 12%)",
    input: "oklch(1 0 0 / 16%)",
    ring: "oklch(0.65 0.18 25)",
  },
};

/** The built-in themes, in the order they're offered. Ids are stable slugs. */
export const BUILT_IN_THEMES: readonly ThemeEntry[] = [
  { id: "nova", builtIn: true, definition: NOVA },
  { id: "heritage", builtIn: true, definition: HERITAGE },
  { id: "fjord", builtIn: true, definition: FJORD },
  { id: "meadow", builtIn: true, definition: MEADOW },
  { id: "ink", builtIn: true, definition: INK },
];

export const DEFAULT_THEME_ID = "nova";

/** The family site's theme, set by an admin — a member can choose their own instead (on their profile). */
export const themeSettingsSchema = z.object({
  defaultThemeId: themeIdSchema.default(DEFAULT_THEME_ID),
});
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;
export const DEFAULT_THEME: ThemeEntry = BUILT_IN_THEMES[0]!;

export function findBuiltInTheme(id: string): ThemeEntry | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id);
}

/**
 * The CSS custom properties a theme sets for one mode — for an inline `style`
 * (the editor's live preview) or, via `themeToCss`, a stylesheet. Fonts and
 * radius are the same in both modes.
 */
export function themeVariables(
  theme: ThemeDefinition,
  mode: "light" | "dark",
): Record<string, string> {
  const colors = theme[mode];
  return {
    ...Object.fromEntries(THEME_COLOR_TOKENS.map((token) => [`--${token}`, colors[token]])),
    "--radius": `${theme.radius}rem`,
    "--app-font-body": FONTS[theme.fonts.body].stack,
    "--app-font-heading": FONTS[theme.fonts.heading].stack,
  };
}

/**
 * The stylesheet that applies a theme app-wide: light values on `:root`,
 * dark ones on `.dark` — the same selectors as packages/ui/src/styles.css,
 * which this overrides by coming later in the document. The theme is parsed
 * here (not just typed) so a value read back from the database is validated
 * once more right before it becomes CSS.
 */
export function themeToCss(theme: ThemeDefinition): string {
  const safe = themeDefinitionSchema.parse(theme);
  const block = (selector: string, mode: "light" | "dark") =>
    `${selector}{${Object.entries(themeVariables(safe, mode))
      .map(([name, value]) => `${name}:${value};`)
      .join("")}}`;
  return `${block(":root", "light")}${block(".dark", "dark")}`;
}

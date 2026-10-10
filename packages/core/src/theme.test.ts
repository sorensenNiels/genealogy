import { describe, expect, it } from "vitest";

import {
  BUILT_IN_THEMES,
  cssColorSchema,
  FONTS,
  THEME_COLOR_TOKENS,
  themeDefinitionSchema,
  themeToCss,
} from "./theme.js";

const nova = BUILT_IN_THEMES[0]!.definition;

describe("built-in themes", () => {
  it("are all valid, with unique ids, every token in both modes and known fonts", () => {
    expect(new Set(BUILT_IN_THEMES.map((theme) => theme.id)).size).toBe(BUILT_IN_THEMES.length);
    for (const { definition } of BUILT_IN_THEMES) {
      expect(() => themeDefinitionSchema.parse(definition)).not.toThrow();
      expect(Object.keys(definition.light).toSorted()).toEqual([...THEME_COLOR_TOKENS].toSorted());
      expect(FONTS[definition.fonts.body]).toBeDefined();
    }
  });
});

describe("cssColorSchema", () => {
  it.each([
    "#1e5a56",
    "#fff",
    "#1e5a56cc",
    "oklch(0.42 0.12 25)",
    "oklch(1 0 0 / 10%)",
    "rgb(30, 90, 86)",
    "hsl(176 50% 23%)",
  ])("accepts %s", (color) => expect(cssColorSchema.safeParse(color).success).toBe(true));

  it.each([
    "red",
    "red;}body{display:none",
    "#1e5a56;--x:url(evil)",
    "oklch(0.4 0.1 25);}",
    "url(https://example.com/x.png)",
    "var(--primary)",
    "expression(alert(1))",
    "oklch(0.4 0.1 25) </style><script>",
  ])("rejects %s", (color) => expect(cssColorSchema.safeParse(color).success).toBe(false));
});

describe("themeToCss", () => {
  it("writes light values on :root and dark ones on .dark, with fonts and radius", () => {
    const css = themeToCss(nova);
    expect(css).toMatch(/^:root\{.*\}\.dark\{.*\}$/);
    expect(css).toContain("--primary:#1e5a56;");
    expect(css).toContain("--primary:#2f8f86;");
    expect(css).toContain("--radius:0.625rem;");
    expect(css).toContain(`--app-font-heading:${FONTS.system.stack};`);
  });

  it("refuses a theme with an unsafe value, rather than writing it out", () => {
    const tampered = { ...nova, light: { ...nova.light, primary: "red;}body{display:none" } };
    expect(() => themeToCss(tampered)).toThrow("Not a CSS color");
  });
});

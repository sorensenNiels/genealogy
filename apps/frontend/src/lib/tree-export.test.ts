import { describe, expect, it } from "vitest";

import { exportFilename } from "./tree-export";

describe("exportFilename", () => {
  const day = new Date("2026-10-09T12:00:00Z");

  it("slugs the centre person's name, folding Danish letters and accents", () => {
    expect(exportFilename("Søren Ærø Ågård", "png", day)).toBe(
      "family-tree-soren-aero-agard-2026-10-09.png",
    );
    expect(exportFilename("José  O'Neil", "pdf", day)).toBe(
      "family-tree-jose-o-neil-2026-10-09.pdf",
    );
  });

  it("leaves the name out when there isn't one", () => {
    expect(exportFilename("", "svg", day)).toBe("family-tree-2026-10-09.svg");
    expect(exportFilename("!!!", "svg", day)).toBe("family-tree-2026-10-09.svg");
  });
});

import { User } from "@react-aria/test-utils";
import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { HistoricalDateInput, type HistoricalDateQuality } from "./historical-date-input";

const testUtilUser = new User({ interactionType: "mouse" });

function DateField({
  initialQuality = "exact" as HistoricalDateQuality,
  onQualityChange,
}: {
  initialQuality?: HistoricalDateQuality;
  onQualityChange?: (quality: HistoricalDateQuality) => void;
}) {
  const [quality, setQuality] = useState<HistoricalDateQuality>(initialQuality);
  const [value, setValue] = useState("1900");
  const [endValue, setEndValue] = useState("");
  return (
    <div data-testid="date-field">
      <HistoricalDateInput
        quality={quality}
        onQualityChange={(next) => {
          setQuality(next);
          onQualityChange?.(next);
        }}
        value={value}
        onChange={setValue}
        endValue={endValue}
        onEndChange={setEndValue}
        preview={null}
      />
    </div>
  );
}

describe("HistoricalDateInput", () => {
  it("lists every quality option", async () => {
    const { getByTestId } = render(<DateField />);
    const tester = testUtilUser.createTester("Select", { root: getByTestId("date-field") });

    await tester.open();
    expect(tester.getOptions().map((option) => option.textContent)).toEqual([
      "Exact",
      "About",
      "Before",
      "After",
      "Between",
    ]);
  });

  it("shows a second date input only once Between is selected", async () => {
    let lastQuality: HistoricalDateQuality | undefined;
    const { getByTestId } = render(<DateField onQualityChange={(q) => (lastQuality = q)} />);
    expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();

    const tester = testUtilUser.createTester("Select", { root: getByTestId("date-field") });
    await tester.open();
    await tester.toggleOptionSelection({ option: "Between" });

    expect(lastQuality).toBe("between");
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
  });

  it("hides the second date input again when switching back to Exact", async () => {
    const { getByTestId } = render(<DateField initialQuality="between" />);
    expect(screen.getByLabelText("End date")).toBeInTheDocument();

    const tester = testUtilUser.createTester("Select", { root: getByTestId("date-field") });
    await tester.open();
    await tester.toggleOptionSelection({ option: "Exact" });

    expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();
  });
});

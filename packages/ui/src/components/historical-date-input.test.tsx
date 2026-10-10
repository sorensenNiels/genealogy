import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { HistoricalDateInput, type HistoricalDateQuality } from "./historical-date-input";

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

function BareDateField() {
  const [value, setValue] = useState("1900");
  return <HistoricalDateInput value={value} onChange={setValue} preview={null} />;
}

describe("HistoricalDateInput", () => {
  it("lists every quality option", async () => {
    render(<DateField />);
    await userEvent.click(screen.getByRole("combobox", { name: "Date quality" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Exact",
      "About",
      "Before",
      "After",
      "Between",
    ]);
  });

  it("shows a second date input only once Between is selected", async () => {
    let lastQuality: HistoricalDateQuality | undefined;
    render(<DateField onQualityChange={(q) => (lastQuality = q)} />);
    expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Date quality" }));
    await userEvent.click(await screen.findByRole("option", { name: "Between" }));

    expect(lastQuality).toBe("between");
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
  });

  it("hides the second date input again when switching back to Exact", async () => {
    render(<DateField initialQuality="between" />);
    expect(screen.getByLabelText("End date")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Date quality" }));
    await userEvent.click(await screen.findByRole("option", { name: "Exact" }));

    expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();
  });

  it("writes an ISO date back into the value box when a day is picked from the calendar", async () => {
    let lastValue: string | undefined;
    function SeededDateField() {
      const [value, setValue] = useState("2024-01-15");
      return (
        <HistoricalDateInput
          quality="exact"
          onQualityChange={() => {}}
          value={value}
          onChange={(next) => {
            setValue(next);
            lastValue = next;
          }}
          endValue=""
          onEndChange={() => {}}
          preview={null}
        />
      );
    }
    const user = userEvent.setup();
    render(<SeededDateField />);

    await user.click(screen.getByRole("button", { name: "Pick a date" }));
    await user.click(screen.getByRole("button", { name: /January 20, 2024/ }));

    expect(lastValue).toBe("2024-01-20");
  });

  it("hides the quality dropdown entirely when quality/onQualityChange are omitted", () => {
    render(<BareDateField />);

    expect(screen.queryByLabelText("Date quality")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();
    // The plain value box and its calendar picker are still there.
    expect(screen.getByDisplayValue("1900")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick a date" })).toBeInTheDocument();
  });
});

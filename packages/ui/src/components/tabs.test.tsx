import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Tabs } from "./tabs";

const tabs = [
  { value: "details", label: "Details", content: "Given/surname, dates, notes." },
  { value: "sources", label: "Sources", content: "Citations will show here." },
] as const;

describe("Tabs", () => {
  it("shows the first tab's panel by default and switches on click", async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    render(<Tabs aria-label="Person" tabs={tabs} onValueChange={onValueChange} />);

    expect(screen.getByRole("tablist", { name: "Person" })).toBeInTheDocument();
    expect(screen.getByText("Given/surname, dates, notes.")).toBeVisible();
    expect(screen.queryByText("Citations will show here.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Sources" }));

    expect(onValueChange).toHaveBeenCalledWith("sources");
    expect(screen.getByRole("tab", { name: "Sources" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Citations will show here.")).toBeVisible();
    expect(screen.queryByText("Given/surname, dates, notes.")).not.toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys", async () => {
    render(<Tabs aria-label="Person" tabs={tabs} />);

    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Sources" })).toHaveFocus();
  });
});

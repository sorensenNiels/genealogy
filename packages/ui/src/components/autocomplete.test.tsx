import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Autocomplete } from "./autocomplete";

const PREFIXES = ["Dr.", "Pastor", "Professor", "Sir"];

function Prefix({ clearable = false, initial = "" }: { clearable?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Autocomplete
        aria-label="Title prefix"
        value={value}
        onValueChange={setValue}
        options={PREFIXES}
        clearable={clearable}
      />
      <output>value:{value}</output>
    </>
  );
}

describe("Autocomplete", () => {
  it("narrows suggestions as the text changes, and fills in the one chosen", async () => {
    render(<Prefix />);
    const input = screen.getByRole("combobox", { name: "Title prefix" });
    await userEvent.type(input, "pr");
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Professor"]);

    await userEvent.click(screen.getByRole("option", { name: "Professor" }));
    expect(screen.getByText("value:Professor")).toBeInTheDocument();
  });

  it("keeps free text that matches nothing in the list", async () => {
    render(<Prefix />);
    await userEvent.type(screen.getByRole("combobox", { name: "Title prefix" }), "Biskop");
    expect(screen.getByText("value:Biskop")).toBeInTheDocument();
  });

  it("shows a clear button only when clearable and there's a value, and it clears", async () => {
    const { unmount } = render(<Prefix initial="Dr." />);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    unmount();

    render(<Prefix clearable initial="Dr." />);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("value:")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});

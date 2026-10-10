import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TagInput } from "./tag-input";

const SUGGESTIONS = ["Scanned", "1970s", "Wedding"];
const NO_TAGS: string[] = [];

function ControlledTagInput({ initialValue = NO_TAGS }: { initialValue?: string[] }) {
  const [value, setValue] = useState(initialValue);
  return <TagInput value={value} onChange={setValue} suggestions={SUGGESTIONS} />;
}

describe("TagInput", () => {
  it("adds a typed tag on Enter and clears the input", async () => {
    render(<ControlledTagInput />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Old scans{Enter}");

    expect(screen.getByText("Old scans")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("adds a suggestion on Enter and excludes already-added tags from suggestions", async () => {
    render(<ControlledTagInput initialValue={["Scanned"]} />);
    expect(screen.getByText("Scanned")).toBeInTheDocument();

    const input = screen.getByRole("combobox");
    await userEvent.type(input, "1970s{Enter}");
    expect(screen.getByText("1970s")).toBeInTheDocument();
  });

  it("does not add a duplicate or blank tag", async () => {
    render(<ControlledTagInput initialValue={["Scanned"]} />);
    const input = screen.getByRole("combobox");

    await userEvent.type(input, "Scanned{Enter}");
    await userEvent.type(input, "   {Enter}{Escape}");
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });

  it("removes a tag when its remove button is pressed", async () => {
    render(<ControlledTagInput initialValue={["Scanned", "Wedding"]} />);
    await userEvent.click(screen.getByRole("button", { name: /Remove Scanned/ }));

    expect(screen.queryByText("Scanned")).not.toBeInTheDocument();
    expect(screen.getByText("Wedding")).toBeInTheDocument();
  });
});

describe("TagInput suggestions", () => {
  it("adds a suggestion picked from the list and leaves the input empty", async () => {
    render(<ControlledTagInput />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "wed");
    await userEvent.click(await screen.findByRole("option", { name: "Wedding" }));

    expect(screen.getByRole("row", { name: /Wedding/ })).toBeInTheDocument();
    expect(input).toHaveValue("");
  });
});

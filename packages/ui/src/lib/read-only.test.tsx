import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "../components/input";
import { RemoveButton } from "../components/remove-button";
import { SaveButton } from "../components/save-button";
import { Switch } from "../components/switch";
import { ReadOnlyProvider } from "./read-only";

function Fields() {
  return (
    <>
      <Input aria-label="Place" defaultValue="Brande" />
      <Switch>Living</Switch>
      <SaveButton isDirty={false} isPending={false}>
        Save
      </SaveButton>
      <RemoveButton itemLabel="this name" onConfirm={() => {}} />
    </>
  );
}

describe("ReadOnlyProvider", () => {
  it("leaves everything editable by default", () => {
    render(<Fields />);
    expect(screen.getByLabelText("Place")).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("makes fields read-only and drops save/remove actions", () => {
    render(
      <ReadOnlyProvider>
        <Fields />
      </ReadOnlyProvider>,
    );
    expect(screen.getByLabelText("Place")).toHaveAttribute("readonly");
    expect(screen.getByRole("switch", { name: "Living" })).toHaveAttribute("aria-readonly", "true");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("can be switched off for a subtree", () => {
    render(
      <ReadOnlyProvider readOnly={false}>
        <Fields />
      </ReadOnlyProvider>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

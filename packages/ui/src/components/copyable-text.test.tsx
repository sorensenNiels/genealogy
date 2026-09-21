import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CopyableText } from "./copyable-text";

describe("CopyableText", () => {
  it("copies its value to the clipboard and shows a brief confirmation", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyableText value="ABCD-EFG" />);
    await userEvent.click(screen.getByRole("button", { name: /ABCD-EFG/ }));

    expect(writeText).toHaveBeenCalledWith("ABCD-EFG");
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });
});

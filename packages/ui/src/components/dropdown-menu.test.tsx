import { User } from "@react-aria/test-utils";
import { render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu";

const testUtilUser = new User({ interactionType: "mouse" });

function AccountMenu({ onAction }: { onAction?: (key: string) => void }) {
  const [lastAction, setLastAction] = useState<string | null>(null);
  return (
    <div data-testid="account-menu">
      <DropdownMenu>
        <Button variant="ghost">Account</Button>
        <DropdownMenuContent>
          <DropdownMenuItem
            id="profile"
            onAction={() => {
              setLastAction("profile");
              onAction?.("profile");
            }}
          >
            Profile settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            id="sign-out"
            onAction={() => {
              setLastAction("sign-out");
              onAction?.("sign-out");
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <p data-testid="last-action">{lastAction}</p>
    </div>
  );
}

describe("DropdownMenu", () => {
  it("is closed until opened, then lists every item", async () => {
    const { getByTestId } = render(<AccountMenu />);
    const tester = testUtilUser.createTester("Menu", { root: getByTestId("account-menu") });

    expect(tester.getMenu()).toBeNull();
    await tester.open();
    expect(tester.getOptions().map((option) => option.textContent)).toEqual([
      "Profile settings",
      "Sign out",
    ]);
  });

  it("runs the item's action and closes when one is chosen", async () => {
    let lastAction: string | undefined;
    const { getByTestId } = render(<AccountMenu onAction={(key) => (lastAction = key)} />);
    const tester = testUtilUser.createTester("Menu", { root: getByTestId("account-menu") });

    await tester.open();
    await tester.toggleOptionSelection({ option: "Sign out" });

    expect(lastAction).toBe("sign-out");
    expect(getByTestId("last-action")).toHaveTextContent("sign-out");
    expect(tester.getMenu()).toBeNull();
  });
});

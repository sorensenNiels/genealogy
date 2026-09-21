import { User } from "@react-aria/test-utils";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsPanels, TabsTrigger } from "./tabs";

const testUtilUser = new User({ interactionType: "mouse" });

function ExampleTabs() {
  return (
    <Tabs defaultSelectedKey="details">
      <TabsList aria-label="Person">
        <TabsTrigger id="details">Details</TabsTrigger>
        <TabsTrigger id="sources">Sources</TabsTrigger>
      </TabsList>
      <TabsPanels>
        <TabsContent id="details">Given/surname, dates, notes.</TabsContent>
        <TabsContent id="sources">Citations will show here.</TabsContent>
      </TabsPanels>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("shows the default tab's panel and switches on click", async () => {
    render(<ExampleTabs />);
    expect(screen.getByText("Given/surname, dates, notes.")).toBeVisible();
    expect(screen.queryByText("Citations will show here.")).not.toBeInTheDocument();

    const tester = testUtilUser.createTester("Tabs", { root: screen.getByLabelText("Person") });
    await tester.triggerTab({ tab: "Sources" });

    expect(screen.getByText("Citations will show here.")).toBeVisible();
    expect(screen.queryByText("Given/surname, dates, notes.")).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";

import { SEARCH_MATCH_END, SEARCH_MATCH_START, splitSearchSnippet } from "./search.js";

describe("splitSearchSnippet", () => {
  it("splits matched words out of the surrounding text", () => {
    const snippet = `born in ${SEARCH_MATCH_START}Brande${SEARCH_MATCH_END}, baptised ${SEARCH_MATCH_START}Brande${SEARCH_MATCH_END}`;
    expect(splitSearchSnippet(snippet)).toEqual([
      { text: "born in ", match: false },
      { text: "Brande", match: true },
      { text: ", baptised ", match: false },
      { text: "Brande", match: true },
    ]);
  });

  it("leaves a snippet with no match as one plain run", () => {
    expect(splitSearchSnippet("<b>not html</b>")).toEqual([
      { text: "<b>not html</b>", match: false },
    ]);
  });
});

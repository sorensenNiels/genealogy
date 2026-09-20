import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { cypher, parseAgtype } from "./age.js";

// Every guard under test throws before the pool is touched.
const noPool = {} as Pool;

describe("parseAgtype", () => {
  it("strips the vertex annotation AGE appends", () => {
    expect(
      parseAgtype('{"id": 1, "label": "Person", "properties": {"id": "abc"}}::vertex'),
    ).toEqual({ id: 1, label: "Person", properties: { id: "abc" } });
  });

  it("strips the edge annotation", () => {
    expect(parseAgtype('{"id": 2, "label": "PARENT_OF"}::edge')).toEqual({
      id: 2,
      label: "PARENT_OF",
    });
  });

  it("decodes a plain scalar", () => {
    expect(parseAgtype("3")).toBe(3);
  });

  it("passes an undecodable value through rather than throwing", () => {
    expect(parseAgtype("not json")).toBe("not json");
  });

  it("maps a null column to null", () => {
    expect(parseAgtype(null)).toBeNull();
  });
});

describe("cypher", () => {
  // The query text, graph name and column list are spliced into the SQL, so
  // these guards are the only thing standing between a caller's mistake and an
  // injection.
  it("rejects a query that would break out of the dollar quote", async () => {
    await expect(
      cypher(noPool, "MATCH (p) RETURN p $$; DROP TABLE persons; --", ["p"]),
    ).rejects.toThrow(/\$\$/);
  });

  it("rejects a graph name that is not a bare identifier", async () => {
    await expect(
      cypher(noPool, "MATCH (p) RETURN p", ["p"], { graph: "genealogy'; --" }),
    ).rejects.toThrow(/Invalid graph name/);
  });

  it("rejects a result column that is not a bare identifier", async () => {
    await expect(cypher(noPool, "MATCH (p) RETURN p", ["p agtype, x"])).rejects.toThrow(
      /Invalid result column/,
    );
  });

  it("requires at least one result column", async () => {
    await expect(cypher(noPool, "MATCH (p) RETURN p", [])).rejects.toThrow(
      /at least one return column/,
    );
  });
});

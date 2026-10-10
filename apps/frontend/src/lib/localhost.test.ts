import { describe, expect, it } from "vitest";

import { isLocalhostName } from "./localhost";

describe("isLocalhostName", () => {
  it.each(["localhost", "app.localhost", "127.0.0.1", "[::1]", "::1"])("%s is local", (host) => {
    expect(isLocalhostName(host)).toBe(true);
  });

  it.each(["genealogy.example.com", "192.168.1.10", "localhost.example.com", "notlocalhost"])(
    "%s is not",
    (host) => {
      expect(isLocalhostName(host)).toBe(false);
    },
  );
});

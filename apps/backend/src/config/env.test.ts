import { describe, expect, it } from "vitest";

import { corsOrigins, validateEnv } from "./env.js";

const validEnv = {
  DATABASE_URL: "postgres://user:pw@db:5432/genealogy",
  BETTER_AUTH_SECRET: "test-secret",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
};

describe("validateEnv", () => {
  it("applies defaults around a minimal environment", () => {
    const env = validateEnv(validEnv);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.CORS_ORIGINS).toBe("http://localhost:5173");
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("coerces PORT from the string the environment always gives", () => {
    const env = validateEnv({ ...validEnv, PORT: "8080" });
    expect(env.PORT).toBe(8080);
  });

  it("refuses to boot without a database URL", () => {
    const { DATABASE_URL: _DATABASE_URL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("refuses to boot without a better-auth secret", () => {
    const { BETTER_AUTH_SECRET: _BETTER_AUTH_SECRET, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("refuses to boot without Google OAuth credentials", () => {
    const { GOOGLE_CLIENT_ID: _GOOGLE_CLIENT_ID, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("rejects an unknown NODE_ENV rather than guessing", () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});

describe("corsOrigins", () => {
  it("splits and trims a comma-separated list", () => {
    expect(corsOrigins("http://localhost:5173, https://tree.example ")).toEqual([
      "http://localhost:5173",
      "https://tree.example",
    ]);
  });

  it("drops empty entries from a trailing comma", () => {
    expect(corsOrigins("http://localhost:5173,")).toEqual(["http://localhost:5173"]);
  });
});

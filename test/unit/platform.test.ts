import { describe, it, expect } from "vitest";
import { isWindows, getShell } from "../../src/utils/platform.js";

describe("isWindows", () => {
  it("returns a boolean", () => {
    expect(typeof isWindows()).toBe("boolean");
  });

  it("matches process.platform", () => {
    expect(isWindows()).toBe(process.platform === "win32");
  });
});

describe("getShell", () => {
  it("returns a non-empty string", () => {
    expect(getShell().length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { runCommand } from "../../src/commands/run.js";

describe("input validation", () => {
  it("rejects invalid trust level", async () => {
    await expect(
      runCommand(".", {
        agent: "claude",
        trust: "../../etc/passwd",
        persist: false,
        isolatedCaches: false,
        network: "full",
        env: [],
        mount: [],
      }),
    ).rejects.toThrow("Invalid trust level");
  });

  it("rejects invalid agent", async () => {
    await expect(
      runCommand(".", {
        agent: "unknown",
        trust: "bind",
        persist: false,
        isolatedCaches: false,
        network: "full",
        env: [],
        mount: [],
      }),
    ).rejects.toThrow("Invalid agent");
  });

  it("rejects invalid network mode", async () => {
    await expect(
      runCommand(".", {
        agent: "claude",
        trust: "bind",
        persist: false,
        isolatedCaches: false,
        network: "hacker",
        env: [],
        mount: [],
      }),
    ).rejects.toThrow("Invalid network mode");
  });

  it("rejects mount targeting root", async () => {
    await expect(
      runCommand(".", {
        agent: "claude",
        trust: "bind",
        persist: false,
        isolatedCaches: false,
        network: "full",
        env: [],
        mount: ["/host:/"],
      }),
    ).rejects.toThrow("forbidden");
  });

  it("rejects mount targeting /etc", async () => {
    await expect(
      runCommand(".", {
        agent: "claude",
        trust: "bind",
        persist: false,
        isolatedCaches: false,
        network: "full",
        env: [],
        mount: ["/host:/etc/config"],
      }),
    ).rejects.toThrow("forbidden");
  });

  it("rejects malformed mount", async () => {
    await expect(
      runCommand(".", {
        agent: "claude",
        trust: "bind",
        persist: false,
        isolatedCaches: false,
        network: "full",
        env: [],
        mount: ["just-a-path"],
      }),
    ).rejects.toThrow("Invalid mount format");
  });
});

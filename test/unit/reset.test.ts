import { describe, it, expect } from "vitest";
import { buildResetCommand, validateResetArgs, type ValidationResult } from "../../src/commands/reset.js";

describe("reset argument validation", () => {
  it("rejects invalid target", () => {
    expect(() => validateResetArgs("everything", "claude")).toThrow(
      /Invalid reset target/,
    );
  });

  it("accepts valid targets", () => {
    expect(() => validateResetArgs("auth", "claude")).not.toThrow();
    expect(() => validateResetArgs("mcp", "claude")).not.toThrow();
    expect(() => validateResetArgs("cache", "claude")).not.toThrow();
  });

  it("rejects invalid agent", () => {
    expect(() => validateResetArgs("auth", "gpt")).toThrow(/Invalid agent/);
  });

  it("accepts valid agents", () => {
    expect(() => validateResetArgs("auth", "claude")).not.toThrow();
    expect(() => validateResetArgs("auth", "codex")).not.toThrow();
  });

  it("returns 'skip' result for mcp + codex (not an error)", () => {
    const result = validateResetArgs("mcp", "codex");
    expect(result).toEqual({ skip: true, message: "Codex does not use MCP servers." });
  });
});

describe("reset command generation", () => {
  it("generates auth reset command for claude", () => {
    const cmd = buildResetCommand("auth", "claude");
    expect(cmd.image).toBe("containme-base");
    expect(cmd.volumeMount).toBe("claude-data:/home/agent/.claude");
    expect(cmd.shellCommand).toContain("rm -f /home/agent/.claude/.credentials.json");
  });

  it("generates auth reset command for codex", () => {
    const cmd = buildResetCommand("auth", "codex");
    expect(cmd.volumeMount).toBe("codex-data:/home/agent/.codex");
    expect(cmd.shellCommand).toContain("rm -f /home/agent/.codex/auth.json");
  });

  it("generates mcp reset command for claude", () => {
    const cmd = buildResetCommand("mcp", "claude");
    expect(cmd.shellCommand).toContain("python3");
    expect(cmd.shellCommand).toContain("mcpServers");
    expect(cmd.shellCommand).toContain(".claude.json");
  });

  it("generates cache reset command for claude", () => {
    const cmd = buildResetCommand("cache", "claude");
    expect(cmd.shellCommand).toContain("rm -rf");
    expect(cmd.shellCommand).toContain("cache/");
    expect(cmd.shellCommand).toContain("statsig/");
    expect(cmd.shellCommand).toContain("telemetry/");
    expect(cmd.shellCommand).toContain("debug/");
    expect(cmd.shellCommand).toContain("paste-cache/");
    expect(cmd.shellCommand).toContain("stats-cache.json");
  });

  it("generates cache reset command for codex", () => {
    const cmd = buildResetCommand("cache", "codex");
    expect(cmd.shellCommand).toContain("rm -rf /home/agent/.codex/log/");
  });
});

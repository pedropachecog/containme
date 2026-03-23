import { describe, it, expect } from "vitest";
import { claudeCodeConfig } from "../../src/agents/claude-code.js";
import { codexConfig } from "../../src/agents/codex.js";

describe("claudeCodeConfig", () => {
  it("uses correct agent name", () => {
    expect(claudeCodeConfig.name).toBe("claude");
  });

  it("uses ANTHROPIC env vars", () => {
    expect(claudeCodeConfig.apiKeyEnvVar).toBe("ANTHROPIC_API_KEY");
    expect(claudeCodeConfig.apiUrlEnvVar).toBe("ANTHROPIC_BASE_URL");
  });

  it("defaults to dangerously-skip-permissions", () => {
    expect(claudeCodeConfig.defaultCommand).toContain("--dangerously-skip-permissions");
  });

  it("points to correct compose file", () => {
    expect(claudeCodeConfig.composeFile).toBe("docker-compose.claude.yml");
  });
});

describe("codexConfig", () => {
  it("uses correct agent name", () => {
    expect(codexConfig.name).toBe("codex");
  });

  it("uses OPENAI env vars", () => {
    expect(codexConfig.apiKeyEnvVar).toBe("OPENAI_API_KEY");
    expect(codexConfig.apiUrlEnvVar).toBe("OPENAI_BASE_URL");
  });

  it("defaults to dangerously-bypass-approvals-and-sandbox", () => {
    expect(codexConfig.defaultCommand).toContain("--dangerously-bypass-approvals-and-sandbox");
  });
});

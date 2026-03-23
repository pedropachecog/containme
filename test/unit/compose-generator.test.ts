import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import { generateComposeOverride, generateSecretsEnvFile } from "../../src/core/compose-generator.js";
import { claudeCodeConfig } from "../../src/agents/claude-code.js";
import { codexConfig } from "../../src/agents/codex.js";
import type { RunOptions } from "../../src/core/compose-generator.js";

function makeOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    agent: claudeCodeConfig,
    trust: "bind",
    env: [],
    mounts: [],
    persist: false,
    isolatedCaches: false,
    network: "full",
    sessionId: "abc12345",
    projectPath: "/d/test/project",
    credentials: {},
    secretsFilePath: "/tmp/containme-secrets-abc12345.env",
    ...overrides,
  };
}

describe("generateComposeOverride", () => {
  it("generates valid YAML", () => {
    const yaml = generateComposeOverride(makeOptions());
    const parsed = parse(yaml);
    expect(parsed).toHaveProperty("services.agent");
  });

  it("sets container_name with session ID", () => {
    const yaml = generateComposeOverride(makeOptions({ sessionId: "deadbeef" }));
    const parsed = parse(yaml);
    expect(parsed.services.agent.container_name).toBe("containme-deadbeef");
  });

  it("sets labels for session, agent, and trust", () => {
    const yaml = generateComposeOverride(makeOptions());
    const labels = parse(yaml).services.agent.labels;
    expect(labels["containme.session"]).toBe("abc12345");
    expect(labels["containme.agent"]).toBe("claude");
    expect(labels["containme.trust"]).toBe("bind");
  });

  it("does NOT include API key in override YAML (secrets go in env_file)", () => {
    const yaml = generateComposeOverride(
      makeOptions({
        credentials: { apiKey: "sk-test-key" },
      }),
    );
    const env = parse(yaml).services.agent.environment;
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("does NOT include GitHub token in override YAML", () => {
    const yaml = generateComposeOverride(
      makeOptions({
        credentials: { githubToken: "ghp_testtoken" },
      }),
    );
    const env = parse(yaml).services.agent.environment;
    expect(env).not.toHaveProperty("GITHUB_TOKEN");
  });

  it("references env_file for secrets", () => {
    const yaml = generateComposeOverride(
      makeOptions({ secretsFilePath: "/tmp/containme-secrets-test.env" }),
    );
    const envFile = parse(yaml).services.agent.env_file;
    expect(envFile).toContain("/tmp/containme-secrets-test.env");
  });

  it("forwards git identity when present", () => {
    const yaml = generateComposeOverride(
      makeOptions({
        credentials: { gitUserName: "Test User", gitUserEmail: "test@example.com" },
      }),
    );
    const env = parse(yaml).services.agent.environment;
    expect(env.GIT_USER_NAME).toBe("Test User");
    expect(env.GIT_USER_EMAIL).toBe("test@example.com");
  });

  it("includes session ID in environment", () => {
    const yaml = generateComposeOverride(makeOptions());
    const env = parse(yaml).services.agent.environment;
    expect(env.CONTAINME_SESSION_ID).toBe("abc12345");
  });

  it("handles extra --env KEY=VALUE flags", () => {
    const yaml = generateComposeOverride(
      makeOptions({ env: ["MY_VAR=hello", "OTHER=world"] }),
    );
    const env = parse(yaml).services.agent.environment;
    expect(env.MY_VAR).toBe("hello");
    expect(env.OTHER).toBe("world");
  });

  it("sets network_mode none when network is none", () => {
    const yaml = generateComposeOverride(makeOptions({ network: "none" }));
    const parsed = parse(yaml);
    expect(parsed.services.agent.network_mode).toBe("none");
  });

  it("does not set network_mode when network is full", () => {
    const yaml = generateComposeOverride(makeOptions({ network: "full" }));
    const parsed = parse(yaml);
    expect(parsed.services.agent.network_mode).toBeUndefined();
  });

  it("adds additional mounts when provided", () => {
    const yaml = generateComposeOverride(
      makeOptions({ mounts: ["/host/data:/container/data:ro"] }),
    );
    const volumes = parse(yaml).services.agent.volumes;
    expect(volumes).toContain("/host/data:/container/data:ro");
  });

  it("does not add volumes key when no mounts", () => {
    const yaml = generateComposeOverride(makeOptions({ mounts: [] }));
    const parsed = parse(yaml);
    expect(parsed.services.agent.volumes).toBeUndefined();
  });

  it("creates session-scoped volumes with --isolated-caches", () => {
    const yaml = generateComposeOverride(
      makeOptions({ isolatedCaches: true, sessionId: "abcd1234" }),
    );
    const parsed = parse(yaml);
    expect(parsed.volumes["npm-cache"].name).toBe("containme-npm-abcd1234");
    expect(parsed.volumes["pip-cache"].name).toBe("containme-pip-abcd1234");
    expect(parsed.volumes["cargo-cache"].name).toBe("containme-cargo-abcd1234");
  });

  it("does not create session volumes without --isolated-caches", () => {
    const yaml = generateComposeOverride(makeOptions({ isolatedCaches: false }));
    const parsed = parse(yaml);
    expect(parsed.volumes).toBeUndefined();
  });
});

describe("generateSecretsEnvFile", () => {
  it("includes API key for Claude agent", () => {
    const content = generateSecretsEnvFile(
      { apiKey: "sk-ant-test" },
      claudeCodeConfig,
    );
    expect(content).toContain("ANTHROPIC_API_KEY=sk-ant-test");
  });

  it("includes API key for Codex agent", () => {
    const content = generateSecretsEnvFile(
      { apiKey: "sk-openai-test" },
      codexConfig,
    );
    expect(content).toContain("OPENAI_API_KEY=sk-openai-test");
  });

  it("includes API URL when provided", () => {
    const content = generateSecretsEnvFile(
      {},
      claudeCodeConfig,
      "http://host.docker.internal:8080/v1",
    );
    expect(content).toContain("ANTHROPIC_BASE_URL=http://host.docker.internal:8080/v1");
  });

  it("includes GitHub token when present", () => {
    const content = generateSecretsEnvFile(
      { githubToken: "ghp_test" },
      claudeCodeConfig,
    );
    expect(content).toContain("GITHUB_TOKEN=ghp_test");
  });

  it("returns empty string when no secrets", () => {
    const content = generateSecretsEnvFile({}, claudeCodeConfig);
    expect(content).toBe("");
  });

  it("does not include git identity (non-secret, goes in override)", () => {
    const content = generateSecretsEnvFile(
      { gitUserName: "Test", gitUserEmail: "test@test.com" },
      claudeCodeConfig,
    );
    expect(content).not.toContain("GIT_USER_NAME");
    expect(content).not.toContain("GIT_USER_EMAIL");
  });
});

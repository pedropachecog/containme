import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveCredentials } from "../../src/core/credential-resolver.js";

describe("resolveCredentials", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads ANTHROPIC_API_KEY for claude agent", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const creds = await resolveCredentials("claude");
    expect(creds.apiKey).toBe("sk-ant-test");
  });

  it("reads OPENAI_API_KEY for codex agent", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const creds = await resolveCredentials("codex");
    expect(creds.apiKey).toBe("sk-openai-test");
  });

  it("passes through apiUrl", async () => {
    const creds = await resolveCredentials("claude", "http://localhost:8080/v1");
    expect(creds.apiUrl).toBe("http://localhost:8080/v1");
  });

  it("reads GITHUB_TOKEN", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    const creds = await resolveCredentials("claude");
    expect(creds.githubToken).toBe("ghp_test");
  });

  it("falls back to GH_TOKEN", async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "ghp_fallback";
    const creds = await resolveCredentials("claude");
    expect(creds.githubToken).toBe("ghp_fallback");
  });

  it("reads explicit git identity env vars", async () => {
    process.env.GIT_USER_NAME = "Test User";
    process.env.GIT_USER_EMAIL = "test@test.com";
    const creds = await resolveCredentials("claude");
    expect(creds.gitUserName).toBe("Test User");
    expect(creds.gitUserEmail).toBe("test@test.com");
  });

  it("returns undefined apiKey when env var is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const creds = await resolveCredentials("claude");
    expect(creds.apiKey).toBeUndefined();
  });
});

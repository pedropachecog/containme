import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isWindows } from "../utils/platform.js";

export interface Credentials {
  apiKey?: string;
  apiUrl?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  githubToken?: string;
  /** Host path to .claude.json for first-run bootstrap (Docker-compatible format) */
  claudeConfigPath?: string;
}

function tryGitConfig(key: string): string | undefined {
  try {
    return execSync(`git config ${key}`, { encoding: "utf-8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function resolveCredentials(
  agent: "claude" | "codex",
  apiUrl?: string,
): Promise<Credentials> {
  const credentials: Credentials = {};

  // API key
  if (agent === "claude") {
    credentials.apiKey = process.env.ANTHROPIC_API_KEY;
  } else {
    credentials.apiKey = process.env.OPENAI_API_KEY;
  }

  // API URL (for local models or custom endpoints)
  if (apiUrl) {
    credentials.apiUrl = apiUrl;
  }

  // Git identity – prefer explicit env vars, fall back to git config
  credentials.gitUserName =
    process.env.GIT_USER_NAME ?? tryGitConfig("user.name");
  credentials.gitUserEmail =
    process.env.GIT_USER_EMAIL ?? tryGitConfig("user.email");

  // GitHub token
  credentials.githubToken =
    process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

  // Claude Code auth — detect host's .claude.json for first-run bootstrap
  // After first run, the persistent claude-data volume takes over
  if (agent === "claude") {
    const claudeJson = path.join(os.homedir(), ".claude.json");
    if (existsSync(claudeJson)) {
      // Docker Compose on Windows needs forward slashes but drive letter preserved
      credentials.claudeConfigPath = isWindows()
        ? claudeJson.replace(/\\/g, "/")
        : claudeJson;
    }
  }

  return credentials;
}

import { execSync } from "node:child_process";

export interface Credentials {
  apiKey?: string;
  apiUrl?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  githubToken?: string;
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

  return credentials;
}

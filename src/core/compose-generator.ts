import { stringify } from "yaml";
import type { AgentConfig } from "../agents/claude-code.js";
import type { Credentials } from "./credential-resolver.js";

export interface RunOptions {
  agent: AgentConfig;
  trust: string;
  apiUrl?: string;
  env: string[];
  mounts: string[];
  persist: boolean;
  network: string;
  sessionId: string;
  projectPath: string;
  prompt?: string;
  credentials: Credentials;
}

/**
 * Generates a docker-compose.override.yml YAML string for a single session.
 */
export function generateComposeOverride(options: RunOptions): string {
  const {
    agent,
    trust,
    apiUrl,
    env,
    sessionId,
    credentials,
  } = options;

  // Build the environment map
  const environment: Record<string, string> = {};

  // Inject the API key under the agent-specific env var name
  if (credentials.apiKey) {
    environment[agent.apiKeyEnvVar] = credentials.apiKey;
  }

  // Optional API URL (e.g. for local models)
  if (apiUrl) {
    environment[agent.apiUrlEnvVar] = apiUrl;
  }

  // Git identity
  if (credentials.gitUserName) {
    environment.GIT_USER_NAME = credentials.gitUserName;
  }
  if (credentials.gitUserEmail) {
    environment.GIT_USER_EMAIL = credentials.gitUserEmail;
  }

  // GitHub token
  if (credentials.githubToken) {
    environment.GITHUB_TOKEN = credentials.githubToken;
  }

  // Session ID
  environment.CONTAINME_SESSION_ID = sessionId;

  // Extra --env flags from the CLI
  for (const entry of env) {
    const eqIndex = entry.indexOf("=");
    if (eqIndex !== -1) {
      const key = entry.slice(0, eqIndex);
      const value = entry.slice(eqIndex + 1);
      environment[key] = value;
    } else {
      // If no value supplied, forward from the host environment
      const hostValue = process.env[entry];
      if (hostValue !== undefined) {
        environment[entry] = hostValue;
      }
    }
  }

  const composeObject = {
    services: {
      agent: {
        environment,
        container_name: `containme-${sessionId}`,
        labels: {
          "containme.session": sessionId,
          "containme.agent": agent.name,
          "containme.trust": trust,
        },
      },
    },
  };

  return stringify(composeObject);
}

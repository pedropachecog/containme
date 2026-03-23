import { stringify } from "yaml";
import type { AgentConfig } from "../agents/claude-code.js";
import type { Credentials } from "./credential-resolver.js";

export interface RunOptions {
  agent: AgentConfig;
  trust: string;
  apiUrl?: string;
  model?: string;
  env: string[];
  mounts: string[];
  persist: boolean;
  isolatedCaches: boolean;
  network: string;
  sessionId: string;
  projectPath: string;
  prompt?: string;
  credentials: Credentials;
  secretsFilePath: string;
}

/**
 * Generates the secrets .env file content (KEY=VALUE lines).
 * This file is written to the OS tmpdir, NOT the project directory.
 */
export function generateSecretsEnvFile(
  credentials: Credentials,
  agent: AgentConfig,
  apiUrl?: string,
): string {
  const lines: string[] = [];

  if (credentials.apiKey) {
    lines.push(`${agent.apiKeyEnvVar}=${credentials.apiKey}`);
  }

  if (apiUrl) {
    lines.push(`${agent.apiUrlEnvVar}=${apiUrl}`);
  }

  if (credentials.githubToken) {
    lines.push(`GITHUB_TOKEN=${credentials.githubToken}`);
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

/**
 * Generates a docker-compose.override.yml YAML string for a single session.
 * Secrets are NOT included — they go in the env_file instead.
 */
export function generateComposeOverride(options: RunOptions): string {
  const {
    agent,
    trust,
    network,
    model,
    env,
    mounts,
    sessionId,
    credentials,
    secretsFilePath,
    isolatedCaches,
  } = options;

  // Build the environment map — NO SECRETS here
  const environment: Record<string, string> = {};

  // Git identity (non-secret)
  if (credentials.gitUserName) {
    environment.GIT_USER_NAME = credentials.gitUserName;
  }
  if (credentials.gitUserEmail) {
    environment.GIT_USER_EMAIL = credentials.gitUserEmail;
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

  // Build the service definition
  const agentService: Record<string, unknown> = {
    environment,
    env_file: [secretsFilePath],
    container_name: `containme-${sessionId}`,
    labels: {
      "containme.session": sessionId,
      "containme.agent": agent.name,
      "containme.trust": trust,
    },
  };

  // Override command with model flag if specified
  if (model) {
    const cmd = [...agent.defaultCommand, "--model", model];
    agentService.command = cmd;
  }

  // Network mode (M2)
  if (network === "none") {
    agentService.network_mode = "none";
  }

  // Bootstrap host .claude.json for first run (entrypoint copies if volume is empty)
  const extraVolumes: string[] = [];
  if (credentials.claudeConfigPath) {
    extraVolumes.push(`${credentials.claudeConfigPath}:/home/agent/.claude-host.json:ro`);
  }

  // Additional mounts (M3)
  for (const m of mounts) {
    extraVolumes.push(m);
  }

  if (extraVolumes.length > 0) {
    agentService.volumes = extraVolumes;
  }

  const composeObject: Record<string, unknown> = {
    services: {
      agent: agentService,
    },
  };

  // Session-scoped volumes when --isolated-caches is set (H4)
  if (isolatedCaches) {
    composeObject.volumes = {
      "npm-cache": { name: `containme-npm-${sessionId}` },
      "pip-cache": { name: `containme-pip-${sessionId}` },
      "cargo-cache": { name: `containme-cargo-${sessionId}` },
    };
  }

  return stringify(composeObject);
}

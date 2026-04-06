import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveProjectPath, toAbsolute } from "../core/path-resolver.js";
import { resolveCredentials } from "../core/credential-resolver.js";
import { generateComposeOverride, generateSecretsEnvFile } from "../core/compose-generator.js";
import type { RunOptions } from "../core/compose-generator.js";
import { claudeCodeConfig } from "../agents/claude-code.js";
import { codexConfig } from "../agents/codex.js";
import type { AgentConfig } from "../agents/claude-code.js";
import { getPackageRoot } from "../utils/package-root.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TRUSTS = ["snapshot", "git", "bind"] as const;
const VALID_AGENTS = ["claude", "codex"] as const;
const VALID_NETWORKS = ["full", "limited", "none"] as const;

const FORBIDDEN_MOUNT_TARGETS = ["/", "/etc", "/proc", "/sys", "/run", "/dev"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function agentConfigFor(name: string): AgentConfig {
  switch (name) {
    case "claude":
      return claudeCodeConfig;
    case "codex":
      return codexConfig;
    default:
      throw new Error(`Unknown agent: ${name}`);
  }
}

/** Spawn a process and return its exit code. Rejects on spawn error. */
function spawnAsync(
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on("error", (err) => reject(err));
    child.on("close", resolve);
  });
}

/** Validate mount format and reject dangerous targets. */
function validateMount(mount: string): void {
  const parts = mount.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid mount format: "${mount}". Expected host:container or host:container:opts`);
  }
  const target = parts[1];
  for (const forbidden of FORBIDDEN_MOUNT_TARGETS) {
    if (target === forbidden || target.startsWith(forbidden + "/")) {
      throw new Error(`Mount target "${target}" is forbidden for security reasons.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export interface RunCommandOptions {
  agent: string;
  trust: string;
  persist: boolean;
  isolatedCaches: boolean;
  network: string;
  apiUrl?: string;
  model?: string;
  prompt?: string;
  env: string[];
  mount: string[];
}

export async function runCommand(
  projectPathArg: string | undefined,
  opts: RunCommandOptions,
): Promise<void> {
  // --- Input validation (M1) ---
  if (!(VALID_TRUSTS as readonly string[]).includes(opts.trust)) {
    throw new Error(`Invalid trust level: "${opts.trust}". Must be one of: ${VALID_TRUSTS.join(", ")}`);
  }
  if (!(VALID_AGENTS as readonly string[]).includes(opts.agent)) {
    throw new Error(`Invalid agent: "${opts.agent}". Must be one of: ${VALID_AGENTS.join(", ")}`);
  }
  if (!(VALID_NETWORKS as readonly string[]).includes(opts.network)) {
    throw new Error(`Invalid network mode: "${opts.network}". Must be one of: ${VALID_NETWORKS.join(", ")}`);
  }

  // Validate mounts (M3)
  for (const mount of opts.mount) {
    validateMount(mount);
  }

  // Network mode warnings (M2)
  if (opts.network === "limited") {
    console.warn(`Warning: --network limited is not yet implemented. Using full network access.`);
  }

  // Trust level warning (H3)
  if (opts.trust === "bind") {
    console.warn(`Warning: Trust level "bind" gives the agent live read-write access to your project.`);
    console.warn(`  Use --trust snapshot for maximum safety (once implemented).`);
  }

  const sessionId = randomBytes(16).toString("hex"); // L1: 128-bit session ID
  const rawProjectPath = projectPathArg ?? ".";
  const absoluteProjectPath = toAbsolute(rawProjectPath);
  const dockerProjectPath = resolveProjectPath(absoluteProjectPath);

  const agentConfig = agentConfigFor(opts.agent);
  const credentials = await resolveCredentials(
    opts.agent as "claude" | "codex",
    opts.apiUrl,
  );

  if (!credentials.apiKey && !opts.apiUrl) {
    console.warn(
      `Warning: ${agentConfig.apiKeyEnvVar} is not set. The agent may fail to authenticate.`,
    );
    console.warn(
      `  Use --api-url to connect to a local model server (e.g., llama-server).`,
    );
  }

  // Determine compose file paths
  const packageRoot = getPackageRoot();
  const composeDir = path.join(packageRoot, "compose");

  const baseCompose = path.join(composeDir, "docker-compose.yml");
  const agentCompose = path.join(composeDir, agentConfig.composeFile);
  const trustCompose = path.join(composeDir, `docker-compose.${opts.trust}.yml`);

  // Verify compose files exist
  for (const f of [baseCompose, agentCompose, trustCompose]) {
    if (!existsSync(f)) {
      throw new Error(`Compose file not found: ${f}`);
    }
  }

  // Write secrets to OS tmpdir (C1/H5 — NEVER in project directory)
  const secretsFile = path.join(os.tmpdir(), `containme-secrets-${sessionId}.env`);
  const secretsContent = generateSecretsEnvFile(credentials, agentConfig, opts.apiUrl);
  writeFileSync(secretsFile, secretsContent, { mode: 0o600 });

  // Write the compose override into .containme/ (no secrets in this file)
  const containmeDir = path.join(absoluteProjectPath, ".containme");
  const overrideFile = path.join(containmeDir, `docker-compose.override.${sessionId}.yml`);
  mkdirSync(containmeDir, { recursive: true });

  // Build RunOptions for the compose generator
  const runOptions: RunOptions = {
    agent: agentConfig,
    trust: opts.trust,
    apiUrl: opts.apiUrl,
    model: opts.model,
    env: opts.env,
    mounts: opts.mount,
    persist: opts.persist,
    isolatedCaches: opts.isolatedCaches,
    network: opts.network,
    sessionId,
    projectPath: dockerProjectPath,
    prompt: opts.prompt,
    credentials,
    secretsFilePath: secretsFile,
  };

  const overrideYaml = generateComposeOverride(runOptions);
  writeFileSync(overrideFile, overrideYaml, "utf-8");

  // Cleanup handler — deletes override YAML, secrets file, and session volumes
  const cleanup = () => {
    try {
      rmSync(overrideFile, { force: true });
      rmSync(secretsFile, { force: true });
      // Remove the .containme dir if empty
      try {
        if (readdirSync(containmeDir).length === 0) {
          rmSync(containmeDir, { recursive: true, force: true });
        }
      } catch {
        // dir may not exist
      }
    } catch {
      // best-effort cleanup
    }
  };

  // Wrap everything in try/finally to ensure cleanup on any error
  try {
    // Build the base image first (agent Dockerfiles depend on it via FROM containme-base)
    const baseDockerfile = path.join(packageRoot, "docker", "base.Dockerfile");
    console.log(`[containme] Building base image...`);
    const buildResult = await spawnAsync("docker", [
      "build", "-t", "containme-base",
      "-f", baseDockerfile,
      packageRoot,
    ], { stdio: "inherit" });
    if (buildResult !== null && buildResult !== 0) {
      console.error("[containme] Base image build failed.");
      process.exitCode = buildResult;
      return;
    }

    // Build the agent image via compose
    const childEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      CONTAINME_PROJECT_PATH: dockerProjectPath,
      CONTAINME_WORKSPACE_PATH: dockerProjectPath,
    };

    console.log(`[containme] Building agent image...`);
    const composeBuildResult = await spawnAsync("docker", [
      "compose",
      "-f", baseCompose,
      "-f", agentCompose,
      "-f", trustCompose,
      "-f", overrideFile,
      "build",
    ], { stdio: "inherit", env: childEnv });
    if (composeBuildResult !== null && composeBuildResult !== 0) {
      console.error("[containme] Agent image build failed.");
      process.exitCode = composeBuildResult;
      return;
    }

    // Use "docker compose run" for interactive TTY (stdin forwarding)
    // Resource limits are set in compose file (service-level keys)
    const composeArgs = [
      "compose",
      "-f", baseCompose,
      "-f", agentCompose,
      "-f", trustCompose,
      "-f", overrideFile,
      "run", "--rm", "--service-ports",
      "agent",
    ];

    // Add --no-deps if network is none (M2)
    if (opts.network === "none") {
      composeArgs.splice(composeArgs.indexOf("agent"), 0, "--no-deps");
    }

    console.log(`[containme] Session ${sessionId} — agent: ${agentConfig.displayName}, trust: ${opts.trust}`);
    console.log(`[containme] Project path (Docker): ${dockerProjectPath}`);

    const child = spawn("docker", composeArgs, {
      stdio: "inherit",
      env: childEnv,
    });

    // L3: Handle spawn errors (e.g., docker not on PATH)
    child.on("error", (err) => {
      console.error(`[containme] Failed to spawn docker: ${err.message}`);
      cleanup();
      process.exitCode = 1;
    });

    // L4: Named signal handlers that self-remove and exit
    const onSigint = () => {
      process.removeListener("SIGINT", onSigint);
      cleanup();
      child.kill("SIGINT");
      process.exit(130);
    };
    const onSigterm = () => {
      process.removeListener("SIGTERM", onSigterm);
      cleanup();
      child.kill("SIGTERM");
      process.exit(143);
    };
    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);

    await new Promise<void>((resolve) => {
      child.on("close", (code) => {
        process.removeListener("SIGINT", onSigint);
        process.removeListener("SIGTERM", onSigterm);

        // Clean up session-scoped volumes if --isolated-caches
        if (opts.isolatedCaches) {
          const volumeNames = [
            `containme-npm-${sessionId}`,
            `containme-pip-${sessionId}`,
            `containme-cargo-${sessionId}`,
          ];
          for (const vol of volumeNames) {
            try {
              spawn("docker", ["volume", "rm", vol], { stdio: "ignore" });
            } catch {
              // best-effort
            }
          }
        }

        if (code !== null && code !== 0) {
          process.exitCode = code;
        }
        resolve();
      });
    });
  } finally {
    cleanup();
  }
}

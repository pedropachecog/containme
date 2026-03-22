import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProjectPath, toAbsolute } from "../core/path-resolver.js";
import { resolveCredentials } from "../core/credential-resolver.js";
import { generateComposeOverride } from "../core/compose-generator.js";
import type { RunOptions } from "../core/compose-generator.js";
import { claudeCodeConfig } from "../agents/claude-code.js";
import { codexConfig } from "../agents/codex.js";
import type { AgentConfig } from "../agents/claude-code.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk up from a starting directory until we find a directory that contains package.json. */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, "package.json");
    if (existsSync(candidate)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate the containme package root (no package.json found).");
    }
    dir = parent;
  }
}

function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  return findPackageRoot(thisDir);
}

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

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export interface RunCommandOptions {
  agent: string;
  trust: string;
  persist: boolean;
  network: string;
  apiUrl?: string;
  prompt?: string;
  env: string[];
  mount: string[];
}

export async function runCommand(
  projectPathArg: string | undefined,
  opts: RunCommandOptions,
): Promise<void> {
  const sessionId = randomBytes(4).toString("hex");
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

  // Build RunOptions for the compose generator
  const runOptions: RunOptions = {
    agent: agentConfig,
    trust: opts.trust,
    apiUrl: opts.apiUrl,
    env: opts.env,
    mounts: opts.mount,
    persist: opts.persist,
    network: opts.network,
    sessionId,
    projectPath: dockerProjectPath,
    prompt: opts.prompt,
    credentials,
  };

  // Determine compose file paths
  const packageRoot = getPackageRoot();
  const composeDir = path.join(packageRoot, "compose");

  const baseCompose = path.join(composeDir, "docker-compose.yml");
  const agentCompose = path.join(composeDir, agentConfig.composeFile);
  const trustCompose = path.join(composeDir, `docker-compose.${opts.trust}.yml`);

  // Write the generated override file into a temp directory inside the project
  const containmeDir = path.join(absoluteProjectPath, ".containme");
  const overrideFile = path.join(containmeDir, `docker-compose.override.${sessionId}.yml`);

  mkdirSync(containmeDir, { recursive: true });

  const overrideYaml = generateComposeOverride(runOptions);
  writeFileSync(overrideFile, overrideYaml, "utf-8");

  // Stack all compose files
  const composeArgs = [
    "compose",
    "-f", baseCompose,
    "-f", agentCompose,
    "-f", trustCompose,
    "-f", overrideFile,
    "up",
    "--build",
  ];

  const childEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    CONTAINME_PROJECT_PATH: dockerProjectPath,
  };

  console.log(`[containme] Session ${sessionId} — agent: ${agentConfig.displayName}, trust: ${opts.trust}`);
  console.log(`[containme] Project path (Docker): ${dockerProjectPath}`);

  const child = spawn("docker", composeArgs, {
    stdio: "inherit",
    env: childEnv,
  });

  // Cleanup handler
  const cleanup = () => {
    try {
      rmSync(overrideFile, { force: true });
      // Remove the .containme dir if empty
      if (readdirSync(containmeDir).length === 0) {
        rmSync(containmeDir, { recursive: true, force: true });
      }
    } catch {
      // best-effort cleanup
    }
  };

  child.on("close", (code) => {
    cleanup();
    if (code !== null && code !== 0) {
      process.exitCode = code;
    }
  });

  // Also clean up if the parent process is terminated
  process.on("SIGINT", () => {
    cleanup();
    child.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    cleanup();
    child.kill("SIGTERM");
  });
}

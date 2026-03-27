import { execSync, spawn } from "node:child_process";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import * as readline from "node:readline";
import os from "node:os";
import path from "node:path";
import { resolveProjectPath, toAbsolute } from "../core/path-resolver.js";
import { resolveCredentials } from "../core/credential-resolver.js";
import { claudeCodeConfig } from "../agents/claude-code.js";
import { generateSecretsEnvFile } from "../core/compose-generator.js";
import { getPackageRoot } from "../utils/package-root.js";

export interface ContainmeContainer {
  id: string;
  name: string;
  agent: string;
  trust: string;
  project: string; // Docker-format path from label
  workspaceMount: string; // bind mount source, may differ from label on old containers
  status: string;
}

function listContainmeContainers(): ContainmeContainer[] {
  let output: string;
  try {
    output = execSync(
      'docker ps --filter "label=containme.session" --format "{{.ID}}|{{.Names}}|{{.Status}}"',
      { encoding: "utf-8" },
    ).trim();
  } catch {
    return [];
  }

  if (!output) return [];

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name, ...statusParts] = line.split("|");
      const status = statusParts.join("|");

      let agent = "";
      let trust = "";
      let project = "";
      let workspaceMount = "";

      try {
        const inspect = JSON.parse(
          execSync(`docker inspect ${id} --format "{{json .}}"`, { encoding: "utf-8" }),
        );
        agent = inspect.Config?.Labels?.["containme.agent"] ?? "";
        trust = inspect.Config?.Labels?.["containme.trust"] ?? "";
        project = inspect.Config?.Labels?.["containme.project"] ?? "";

        // Fall back to bind mount source for workspace if no label
        const mounts: Array<{ Type: string; Source: string; Destination: string }> =
          inspect.Mounts ?? [];
        const ws = mounts.find((m) => m.Type === "bind" && m.Destination === "/workspace");
        workspaceMount = ws?.Source ?? project;
      } catch {
        // best-effort
      }

      return { id, name: name.trim(), agent, trust, project, workspaceMount, status };
    });
}

/** Normalize a Docker-format path for display: /run/desktop/mnt/host/d/foo → D:/foo */
export function displayPath(dockerPath: string): string {
  const m = dockerPath.match(/^\/run\/desktop\/mnt\/host\/([a-z])\/(.*)/);
  if (m) return `${m[1].toUpperCase()}:/${m[2]}`;
  return dockerPath;
}

/** Filter containers by agent and/or docker-format project path. Pure function. */
export function filterContainers(
  containers: ContainmeContainer[],
  opts: { agent?: string; dockerPath?: string },
): ContainmeContainer[] {
  let result = containers;
  if (opts.agent) {
    result = result.filter((c) => c.agent === opts.agent);
  }
  if (opts.dockerPath) {
    result = result.filter(
      (c) =>
        c.project === opts.dockerPath ||
        c.workspaceMount === opts.dockerPath ||
        path.basename(c.workspaceMount) === path.basename(opts.dockerPath!),
    );
  }
  return result;
}

export type BashTarget =
  | { action: "exec"; container: ContainmeContainer }
  | { action: "pick"; containers: ContainmeContainer[] }
  | { action: "fresh" };

/** Pure decision: given running containers and filter opts, what should bash do? */
export function resolveBashTarget(
  containers: ContainmeContainer[],
  opts: { agent?: string; dockerPath?: string },
): BashTarget {
  let filtered = filterContainers(containers, { agent: opts.agent });
  if (filtered.length === 0) return { action: "fresh" };

  if (opts.dockerPath) {
    const matched = filterContainers(filtered, { dockerPath: opts.dockerPath });
    if (matched.length === 0) return { action: "fresh" };
    filtered = matched;
  }

  if (filtered.length === 1) return { action: "exec", container: filtered[0] };
  return { action: "pick", containers: filtered };
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function pickContainer(containers: ContainmeContainer[]): Promise<ContainmeContainer | null> {
  if (containers.length === 1) return containers[0];

  console.log("\nRunning containme containers:\n");
  containers.forEach((c, i) => {
    console.log(`  [${i + 1}] ${displayPath(c.workspaceMount || c.project)}`);
    console.log(`      agent=${c.agent}  trust=${c.trust}  id=${c.id.slice(0, 12)}`);
  });

  const answer = await prompt("\nPick a container [1]: ");
  const idx = answer === "" ? 1 : parseInt(answer, 10);
  if (isNaN(idx) || idx < 1 || idx > containers.length) {
    console.error("Invalid selection.");
    return null;
  }
  return containers[idx - 1];
}

export interface BashCommandOptions {
  projectPath?: string;
  agent?: string;
  command?: string;
  asAgent?: boolean;
}

async function startFreshShell(opts: BashCommandOptions): Promise<void> {
  const packageRoot = getPackageRoot();
  const composeDir = path.join(packageRoot, "compose");
  const projectPath = toAbsolute(opts.projectPath ?? ".");
  const dockerProjectPath = resolveProjectPath(projectPath);
  const agentName = opts.agent ?? "claude";
  const agentCompose = agentName === "codex"
    ? path.join(composeDir, "docker-compose.codex.yml")
    : path.join(composeDir, "docker-compose.claude.yml");

  if (!existsSync(agentCompose)) {
    console.error(`[containme] Compose file not found: ${agentCompose}`);
    process.exitCode = 1;
    return;
  }

  const credentials = await resolveCredentials(agentName as "claude" | "codex");
  const agentConfig = agentName === "codex" ? (await import("../agents/codex.js")).codexConfig : claudeCodeConfig;
  const secretsContent = generateSecretsEnvFile(credentials, agentConfig);
  const secretsFile = path.join(os.tmpdir(), `containme-shell-${Date.now()}.env`);
  writeFileSync(secretsFile, secretsContent, { mode: 0o600 });

  const user = opts.asAgent ? "agent" : "root";
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    CONTAINME_PROJECT_PATH: dockerProjectPath,
  };
  if (credentials.gitUserName) env.GIT_USER_NAME = credentials.gitUserName;
  if (credentials.gitUserEmail) env.GIT_USER_EMAIL = credentials.gitUserEmail;

  const composeArgs = [
    "compose",
    "-f", path.join(composeDir, "docker-compose.yml"),
    "-f", agentCompose,
    "-f", path.join(composeDir, "docker-compose.bind.yml"),
    "run", "--rm",
    "-u", user,
    "--env-file", secretsFile,
    "-v", `${projectPath}:/workspace`,
    "agent", "bash",
  ];

  console.log(`[containme] No running session found — starting fresh shell for ${displayPath(dockerProjectPath)}`);

  const child = spawn("docker", composeArgs, { stdio: "inherit", env });
  child.on("error", (err) => {
    console.error(`[containme] Failed to start shell: ${err.message}`);
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    rmSync(secretsFile, { force: true });
    process.exitCode = code ?? 0;
  });
}

export async function bashCommand(opts: BashCommandOptions): Promise<void> {
  const containers = listContainmeContainers();
  const dockerPath = opts.projectPath
    ? resolveProjectPath(toAbsolute(opts.projectPath))
    : undefined;

  const target = resolveBashTarget(containers, { agent: opts.agent, dockerPath });

  if (target.action === "fresh") {
    await startFreshShell(opts);
    return;
  }

  let container: ContainmeContainer | null;
  if (target.action === "pick") {
    container = await pickContainer(target.containers);
  } else {
    container = target.container;
  }

  if (!container) {
    process.exitCode = 1;
    return;
  }

  const user = opts.asAgent ? "agent" : "root";
  const execArgs = opts.command
    ? ["exec", "-u", user, "-it", container.id, "bash", "-c", opts.command]
    : ["exec", "-u", user, "-it", container.id, "bash"];

  console.log(`\n[containme] Attaching to ${displayPath(container.workspaceMount || container.project)} (${container.id.slice(0, 12)})\n`);

  const child = spawn("docker", execArgs, { stdio: "inherit" });
  child.on("error", (err) => {
    console.error(`[containme] Failed to exec: ${err.message}`);
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    process.exitCode = code ?? 0;
  });
}

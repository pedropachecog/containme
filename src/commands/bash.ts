import { execSync, spawn } from "node:child_process";
import * as readline from "node:readline";
import path from "node:path";
import { resolveProjectPath, toAbsolute } from "../core/path-resolver.js";

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
}

export async function bashCommand(opts: BashCommandOptions): Promise<void> {
  let containers = listContainmeContainers();

  if (containers.length === 0) {
    console.error("[containme] No running containme containers found.");
    process.exitCode = 1;
    return;
  }

  // Filter by agent if specified
  if (opts.agent) {
    containers = filterContainers(containers, { agent: opts.agent });
    if (containers.length === 0) {
      console.error(`[containme] No running containers for agent "${opts.agent}".`);
      process.exitCode = 1;
      return;
    }
  }

  // Match by project path if provided
  if (opts.projectPath) {
    const dockerPath = resolveProjectPath(toAbsolute(opts.projectPath));
    containers = filterContainers(containers, { dockerPath });
    if (containers.length === 0) {
      console.error(
        `[containme] No running container found for path: ${opts.projectPath}\n` +
        `  Docker path: ${dockerPath}`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const container = await pickContainer(containers);
  if (!container) {
    process.exitCode = 1;
    return;
  }

  const execArgs = opts.command
    ? ["exec", "-it", container.id, "bash", "-c", opts.command]
    : ["exec", "-it", container.id, "bash"];

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

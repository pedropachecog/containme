import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { claudeCodeConfig } from "../agents/claude-code.js";
import { codexConfig } from "../agents/codex.js";
import { getPackageRoot } from "../utils/package-root.js";

const AGENT_CONFIGS = [claudeCodeConfig, codexConfig];

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

export interface BuildCommandOptions {
  agent?: string; // undefined = all agents
}

export async function buildCommand(opts: BuildCommandOptions): Promise<void> {
  const packageRoot = getPackageRoot();
  const composeDir = path.join(packageRoot, "compose");
  const baseCompose = path.join(composeDir, "docker-compose.yml");
  const baseDockerfile = path.join(packageRoot, "docker", "base.Dockerfile");

  // Compile TypeScript first
  console.log("[containme] Compiling TypeScript...");
  const tscResult = await spawnAsync(
    "npm",
    ["run", "build"],
    { stdio: "inherit", cwd: packageRoot, shell: true },
  );
  if (tscResult !== null && tscResult !== 0) {
    console.error("[containme] TypeScript compilation failed.");
    process.exitCode = tscResult;
    return;
  }

  // Build base image
  console.log("[containme] Building base image...");
  const baseResult = await spawnAsync("docker", [
    "build", "-t", "containme-base",
    "-f", baseDockerfile,
    packageRoot,
  ], { stdio: "inherit" });
  if (baseResult !== null && baseResult !== 0) {
    console.error("[containme] Base image build failed.");
    process.exitCode = baseResult;
    return;
  }

  // Determine which agents to build
  const agentsToBuild = opts.agent
    ? AGENT_CONFIGS.filter((a) => a.name === opts.agent)
    : AGENT_CONFIGS;

  if (opts.agent && agentsToBuild.length === 0) {
    console.error(`[containme] Unknown agent: "${opts.agent}". Valid agents: ${AGENT_CONFIGS.map((a) => a.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  for (const agentConfig of agentsToBuild) {
    const agentCompose = path.join(composeDir, agentConfig.composeFile);
    if (!existsSync(agentCompose)) {
      console.warn(`[containme] Skipping ${agentConfig.name}: compose file not found (${agentCompose})`);
      continue;
    }

    console.log(`[containme] Building ${agentConfig.name} image...`);
    const result = await spawnAsync("docker", [
      "compose",
      "-f", baseCompose,
      "-f", agentCompose,
      "build",
    ], { stdio: "inherit" });

    if (result !== null && result !== 0) {
      console.error(`[containme] ${agentConfig.name} image build failed.`);
      process.exitCode = result;
      return;
    }
  }

  console.log("[containme] Build complete.");
}

import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResetCommand {
  image: string;
  volumeMount: string;
  shellCommand: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TARGETS = ["auth", "mcp", "cache"] as const;
const VALID_AGENTS = ["claude", "codex"] as const;

type ResetTarget = (typeof VALID_TARGETS)[number];
type AgentName = (typeof VALID_AGENTS)[number];

const AGENT_VOLUME: Record<AgentName, string> = {
  claude: "claude-data",
  codex: "codex-data",
};

const AGENT_HOME: Record<AgentName, string> = {
  claude: "/home/agent/.claude",
  codex: "/home/agent/.codex",
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  skip?: boolean;
  message?: string;
}

export function validateResetArgs(target: string, agent: string): ValidationResult {
  if (!(VALID_AGENTS as readonly string[]).includes(agent)) {
    throw new Error(
      `Invalid agent: "${agent}". Must be one of: ${VALID_AGENTS.join(", ")}`,
    );
  }
  if (!(VALID_TARGETS as readonly string[]).includes(target)) {
    throw new Error(
      `Invalid reset target: "${target}". Must be one of: ${VALID_TARGETS.join(", ")}`,
    );
  }
  if (target === "mcp" && agent === "codex") {
    return { skip: true, message: "Codex does not use MCP servers." };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

export function buildResetCommand(target: string, agent: string): ResetCommand {
  const agentName = agent as AgentName;
  const home = AGENT_HOME[agentName];
  const volume = AGENT_VOLUME[agentName];

  if (!home || !volume) {
    throw new Error(`Unknown agent: "${agent}"`);
  }

  const base: Omit<ResetCommand, "shellCommand"> = {
    image: "containme-base",
    volumeMount: `${volume}:${home}`,
  };

  switch (target as ResetTarget) {
    case "auth":
      return {
        ...base,
        shellCommand: authResetShell(agentName, home),
      };
    case "mcp":
      return {
        ...base,
        shellCommand: mcpResetShell(home),
      };
    case "cache":
      return {
        ...base,
        shellCommand: cacheResetShell(agentName, home),
      };
    default:
      throw new Error(`Unknown reset target: "${target}"`);
  }
}

function authResetShell(agent: AgentName, home: string): string {
  if (agent === "claude") {
    // Delete OAuth credentials only. config.json is intentionally NOT deleted —
    // it may contain non-auth settings (e.g., permissions, preferences).
    return `rm -f ${home}/.credentials.json && echo "Deleted ${home}/.credentials.json"`;
  }
  // codex
  return `rm -f ${home}/auth.json && echo "Deleted ${home}/auth.json"`;
}

function mcpResetShell(home: string): string {
  // Use python3 to remove the mcpServers key from .claude.json
  // python3 is available in containme-base (Ubuntu 24.04 includes it)
  // jq is NOT installed, so we use python3 -c for JSON manipulation
  const configPath = `${home}/.claude.json`;
  const pyScript = [
    "import json, os, sys",
    `p = '${configPath}'`,
    "if not os.path.exists(p): sys.exit(print('No config file found — nothing to reset') or 0)",
    "d = json.loads(open(p).read())",
    "if 'mcpServers' not in d: sys.exit(print('No mcpServers key found — nothing to reset') or 0)",
    "del d['mcpServers']",
    "open(p + '.tmp', 'w').write(json.dumps(d, indent=2))",
    "os.replace(p + '.tmp', p)",
    "print('Removed mcpServers from ' + p)",
  ].join("; ");
  return `python3 -c "${pyScript}"`;
}

function cacheResetShell(agent: AgentName, home: string): string {
  if (agent === "claude") {
    const dirs = [
      "cache/",
      "statsig/",
      "telemetry/",
      "debug/",
      "paste-cache/",
      "downloads/",
    ];
    const files = ["stats-cache.json"];
    const rmDirs = dirs.map((d) => `${home}/${d}`).join(" ");
    const rmFiles = files.map((f) => `${home}/${f}`).join(" ");
    return `rm -rf ${rmDirs} && rm -f ${rmFiles} && echo "Cleared Claude cache directories and files"`;
  }
  // codex
  return `rm -rf ${home}/log/ && echo "Cleared Codex log directory"`;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/** Spawn a process and return its exit code. */
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

export async function executeReset(
  target: string,
  agent: string,
): Promise<void> {
  const validation = validateResetArgs(target, agent);
  if (validation.skip) {
    console.log(`[containme] ${validation.message}`);
    return;
  }

  const cmd = buildResetCommand(target, agent);

  console.log(`[containme] Resetting ${target} for ${agent}...`);

  const exitCode = await spawnAsync(
    "docker",
    [
      "run", "--rm",
      "-v", cmd.volumeMount,
      cmd.image,
      "bash", "-c", cmd.shellCommand,
    ],
    { stdio: "inherit" },
  );

  if (exitCode !== null && exitCode !== 0) {
    console.error(`[containme] Reset failed with exit code ${exitCode}`);
    process.exitCode = exitCode;
  }
}

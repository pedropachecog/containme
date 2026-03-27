# Persistent Agent Data + Reset Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace destructible `claude-config` volume with permanent `claude-data` and `codex-data` volumes, and add targeted `containme reset` commands so users never need to delete volumes.

**Architecture:** Each agent gets one permanent Docker volume that is never deleted by containme. Targeted reset commands (`auth`, `mcp`, `cache`) use `docker run --rm` with the agent image to surgically delete specific files inside the volume. The CLI registers a new `containme reset <target>` command with `--agent` flag.

**Tech Stack:** TypeScript (Commander.js), Docker Compose YAML, Docker CLI (`docker run --rm`), Node.js `child_process`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `compose/docker-compose.claude.yml` | Modify | Rename `claude-config` → `claude-data` volume |
| `compose/docker-compose.codex.yml` | Modify | Add `codex-data` volume + `CODEX_HOME` env var |
| `docker/codex.Dockerfile` | Modify | Add `ENV CODEX_HOME="/home/agent/.codex"` |
| `src/commands/reset.ts` | Create | Implements `containme reset auth|mcp|cache` via `docker run --rm` |
| `src/index.ts` | Modify | Register `containme reset` command tree |
| `test/integration/compose-stack.test.ts` | Modify | Update `claude-config` → `claude-data`, add `codex-data` + `CODEX_HOME` tests |
| `test/unit/reset.test.ts` | Create | Unit tests for reset command argument validation + shell command generation |

---

### Task 1: Rename claude-config → claude-data volume

**Files:**
- Modify: `compose/docker-compose.claude.yml`
- Modify: `test/integration/compose-stack.test.ts:57-59`
- Modify: `docker/claude.Dockerfile` (update comment referencing `claude-config`)
- Modify: `src/core/credential-resolver.ts` (update comment referencing `claude-config`)

- [ ] **Step 1: Update the test to expect `claude-data` instead of `claude-config`**

In `test/integration/compose-stack.test.ts`, change the existing test at lines 57-59:

```typescript
it("claude overlay defines claude-data volume", () => {
  const claude = loadYaml("docker-compose.claude.yml");
  expect(claude.volumes).toHaveProperty("claude-data");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/integration/compose-stack.test.ts`
Expected: FAIL — `claude-data` not found, `claude-config` still present

- [ ] **Step 3: Update compose file — rename volume**

Replace the full content of `compose/docker-compose.claude.yml`:

```yaml
services:
  agent:
    build:
      dockerfile: docker/claude.Dockerfile
    environment:
      - ANTHROPIC_API_KEY
      - CLAUDE_CONFIG_DIR=/home/agent/.claude
    volumes:
      - claude-data:/home/agent/.claude
    command: ["claude", "--dangerously-skip-permissions"]

volumes:
  claude-data:
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/integration/compose-stack.test.ts`
Expected: PASS

- [ ] **Step 5: Update stale comments referencing `claude-config`**

In `docker/claude.Dockerfile`, if there is a comment containing `claude-config`, change it to `claude-data`.

In `src/core/credential-resolver.ts`, find the comment at line 54 referencing `claude-config` and update to `claude-data`:

```typescript
// After first run, the persistent claude-data volume takes over
```

- [ ] **Step 6: Verify no remaining references to `claude-config` in source**

Run: `grep -r "claude-config" src/ compose/ docker/ test/`
Expected: No matches

- [ ] **Step 7: Commit**

```bash
git add compose/docker-compose.claude.yml test/integration/compose-stack.test.ts docker/claude.Dockerfile src/core/credential-resolver.ts
git commit -m "feat: rename claude-config volume to claude-data (permanent, never deleted)"
```

---

### Task 2: Add codex-data volume + CODEX_HOME env var

**Files:**
- Modify: `compose/docker-compose.codex.yml`
- Modify: `docker/codex.Dockerfile`
- Modify: `test/integration/compose-stack.test.ts`

- [ ] **Step 1: Write ALL tests for codex volume, CODEX_HOME, and Dockerfile**

Add to `test/integration/compose-stack.test.ts`, inside the `"compose file stack"` describe block:

```typescript
it("codex overlay defines codex-data volume", () => {
  const codex = loadYaml("docker-compose.codex.yml");
  expect(codex.volumes).toHaveProperty("codex-data");
});

it("codex overlay sets CODEX_HOME", () => {
  const codex = loadYaml("docker-compose.codex.yml");
  expect(codex.services.agent.environment).toContain(
    "CODEX_HOME=/home/agent/.codex",
  );
});

it("codex overlay mounts codex-data volume", () => {
  const codex = loadYaml("docker-compose.codex.yml");
  expect(codex.services.agent.volumes).toContain(
    "codex-data:/home/agent/.codex",
  );
});
```

Add to the `"Dockerfile validation"` describe block:

```typescript
it("codex Dockerfile sets CODEX_HOME", () => {
  const content = readFileSync(
    path.join(dockerDir, "codex.Dockerfile"),
    "utf-8",
  );
  expect(content).toContain('CODEX_HOME="/home/agent/.codex"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/integration/compose-stack.test.ts`
Expected: FAIL — `codex-data` volume not defined, `CODEX_HOME` not set, no volumes array, Dockerfile missing ENV

- [ ] **Step 3: Update codex compose file**

Replace `compose/docker-compose.codex.yml`:

```yaml
services:
  agent:
    build:
      dockerfile: docker/codex.Dockerfile
    environment:
      - OPENAI_API_KEY
      - CODEX_HOME=/home/agent/.codex
    volumes:
      - codex-data:/home/agent/.codex
    command: ["codex", "--dangerously-bypass-approvals-and-sandbox"]

volumes:
  codex-data:
```

- [ ] **Step 4: Add ENV to codex Dockerfile**

In `docker/codex.Dockerfile`, add `ENV CODEX_HOME` after the `mkdir` line. Full file:

```dockerfile
FROM containme-base

USER root
RUN npm install -g @openai/codex
USER agent

RUN mkdir -p /home/agent/.codex
ENV CODEX_HOME="/home/agent/.codex"

CMD ["codex", "--dangerously-bypass-approvals-and-sandbox"]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/integration/compose-stack.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add compose/docker-compose.codex.yml docker/codex.Dockerfile test/integration/compose-stack.test.ts
git commit -m "feat: add codex-data volume + CODEX_HOME env var for persistent codex state"
```

---

### Task 3: Create reset command — argument validation + shell command generation

**Files:**
- Create: `src/commands/reset.ts`
- Create: `test/unit/reset.test.ts`

- [ ] **Step 1: Write failing tests for validation**

Create `test/unit/reset.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildResetCommand, validateResetArgs, type ValidationResult } from "../../src/commands/reset.js";

describe("reset argument validation", () => {
  it("rejects invalid target", () => {
    expect(() => validateResetArgs("everything", "claude")).toThrow(
      /Invalid reset target/,
    );
  });

  it("accepts valid targets", () => {
    expect(() => validateResetArgs("auth", "claude")).not.toThrow();
    expect(() => validateResetArgs("mcp", "claude")).not.toThrow();
    expect(() => validateResetArgs("cache", "claude")).not.toThrow();
  });

  it("rejects invalid agent", () => {
    expect(() => validateResetArgs("auth", "gpt")).toThrow(/Invalid agent/);
  });

  it("accepts valid agents", () => {
    expect(() => validateResetArgs("auth", "claude")).not.toThrow();
    expect(() => validateResetArgs("auth", "codex")).not.toThrow();
  });

  it("returns 'skip' result for mcp + codex (not an error)", () => {
    const result = validateResetArgs("mcp", "codex");
    expect(result).toEqual({ skip: true, message: "Codex does not use MCP servers." });
  });
});

describe("reset command generation", () => {
  it("generates auth reset command for claude", () => {
    const cmd = buildResetCommand("auth", "claude");
    expect(cmd.image).toBe("containme-base");
    expect(cmd.volumeMount).toBe("claude-data:/home/agent/.claude");
    expect(cmd.shellCommand).toContain("rm -f /home/agent/.claude/.credentials.json");
  });

  it("generates auth reset command for codex", () => {
    const cmd = buildResetCommand("auth", "codex");
    expect(cmd.volumeMount).toBe("codex-data:/home/agent/.codex");
    expect(cmd.shellCommand).toContain("rm -f /home/agent/.codex/auth.json");
  });

  it("generates mcp reset command for claude", () => {
    const cmd = buildResetCommand("mcp", "claude");
    expect(cmd.shellCommand).toContain("python3");
    expect(cmd.shellCommand).toContain("mcpServers");
    expect(cmd.shellCommand).toContain(".claude.json");
  });

  it("generates cache reset command for claude", () => {
    const cmd = buildResetCommand("cache", "claude");
    expect(cmd.shellCommand).toContain("rm -rf");
    expect(cmd.shellCommand).toContain("cache/");
    expect(cmd.shellCommand).toContain("statsig/");
    expect(cmd.shellCommand).toContain("telemetry/");
    expect(cmd.shellCommand).toContain("debug/");
    expect(cmd.shellCommand).toContain("paste-cache/");
    expect(cmd.shellCommand).toContain("stats-cache.json");
  });

  it("generates cache reset command for codex", () => {
    const cmd = buildResetCommand("cache", "codex");
    expect(cmd.shellCommand).toContain("rm -rf /home/agent/.codex/log/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/reset.test.ts`
Expected: FAIL — module `../../src/commands/reset.js` not found

- [ ] **Step 3: Write the reset module**

Create `src/commands/reset.ts`:

```typescript
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
    "if not os.path.exists(p): print('No config file found — nothing to reset'); sys.exit(0)",
    "d = json.load(open(p))",
    "if 'mcpServers' not in d: print('No mcpServers key found — nothing to reset'); sys.exit(0)",
    "del d['mcpServers']",
    "json.dump(d, open(p, 'w'), indent=2)",
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
```

- [ ] **Step 4: Build and run tests**

Run: `npm run build && npx vitest run test/unit/reset.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/reset.ts test/unit/reset.test.ts
git commit -m "feat: add reset command module with auth/mcp/cache targets"
```

---

### Task 4: Register reset command in CLI

**Files:**
- Modify: `src/index.ts`

Note: This task is pure wiring — no new logic to TDD. Verification is via CLI help output.

- [ ] **Step 1: Add reset command to `src/index.ts`**

Add the import at the top of `src/index.ts`:

```typescript
import { executeReset } from "./commands/reset.js";
```

Add the command registration before `program.parse()`:

```typescript
const resetCmd = new Command("reset")
  .description("Reset specific agent configuration without deleting data")
  .argument("<target>", "What to reset (auth|mcp|cache)")
  .option("-a, --agent <agent>", "Agent to reset (claude|codex)", "claude")
  .action(async (target: string, opts) => {
    await executeReset(target, opts.agent);
  });

program.addCommand(resetCmd);
```

- [ ] **Step 2: Build and verify CLI registration**

Run: `npm run build && node dist/index.js reset --help`
Expected output includes: `Usage: containme reset [options] <target>` and mentions `auth|mcp|cache`

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: register containme reset command in CLI"
```

---

### Task 5: Run full test suite + manual verification

- [ ] **Step 1: Run full test suite**

Run: `npm run build && npx vitest run`
Expected: ALL tests pass

- [ ] **Step 2: Verify CLI help output**

Run: `node dist/index.js --help`
Expected: Shows `run`, `run-local`, and `reset` commands

Run: `node dist/index.js reset --help`
Expected: Shows target argument and `--agent` flag

- [ ] **Step 3: Verify reset validation works**

Run: `node dist/index.js reset invalid`
Expected: Error — "Invalid reset target"

Run: `node dist/index.js reset mcp --agent codex`
Expected: Clean exit (code 0) with message: "Codex does not use MCP servers"

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: test suite adjustments for persistent data feature"
```

---

## Migration Note

Existing users with a `claude-config` volume will need to manually migrate their data to the new `claude-data` volume. This is a one-time operation:

```bash
docker volume create claude-data
docker run --rm -v claude-config:/src -v claude-data:/dst alpine sh -c 'cp -a /src/. /dst/'
```

The old `claude-config` volume can be deleted by the user at their discretion after verifying the migration. Containme will never delete it.

---

## Verification Checklist

After all tasks:

1. `npm run build` — clean build, no errors
2. `npx vitest run` — all tests pass
3. `docker-compose.claude.yml` — volume named `claude-data`, NOT `claude-config`
4. `docker-compose.codex.yml` — volume named `codex-data`, `CODEX_HOME` set
5. `codex.Dockerfile` — has `ENV CODEX_HOME`
6. `containme reset auth` — generates correct `docker run --rm` command
7. `containme reset mcp` — uses python3 for JSON manipulation (no jq dependency)
8. `containme reset mcp --agent codex` — exits cleanly (code 0) with informative message
9. `containme reset cache` — targets correct directories per agent
10. No containme command ever runs `docker volume rm` on agent data volumes

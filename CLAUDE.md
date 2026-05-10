# Containme

## ABSOLUTE RULES — READ FIRST

**NEVER suggest deleting Docker volumes.** The `claude-data` volume contains irreplaceable conversation history, memory, plans, and settings. Never suggest `docker volume rm`, `docker system prune`, or any operation that destroys a volume. Not as a last resort. Not with caveats. Never.

If something is broken, fix it surgically:
- Use `containme reset auth/mcp/cache` for targeted resets
- Delete specific files inside the volume (always ask permission first)
- Never the whole volume

Toolkit for safely running AI coding agents (Claude Code, OpenAI Codex) inside Docker containers with configurable trust levels.

## Project Overview

- **Language**: TypeScript (ESM, Node16 module resolution)
- **CLI framework**: Commander.js
- **Container runtime**: Docker Compose (not Docker sandbox microVMs)
- **Package manager**: npm
- **Target platforms**: Windows (Docker Desktop), WSL, Linux

## Key Architecture Decisions

- Docker Compose containers (not microVMs) — sufficient isolation for accidental agent destruction; no 4GB RAM cap
- Trust levels (snapshot/git/bind) protect project files — the actual differentiator
- `--api-url` flag supports local LLM backends (llama-server on host via `host.docker.internal`)
- Compose overlay pattern: base + agent + trust level + generated override, stacked with `-f` flags
- TypeScript CLI generates override YAML and invokes `docker compose up`

## Build & Run

```bash
npm install
npm run build          # tsc → dist/
node dist/index.js run --help
node dist/index.js run .              # Run Claude Code on current dir (bind mount)
node dist/index.js run -t snapshot .  # Snapshot mode (max safety)
node dist/index.js run --api-url http://host.docker.internal:3456  # Via anthropic-image-proxy (default for run-local)
```

## Code Conventions

- ESM imports with `.js` extensions (e.g., `import from './foo.js'`)
- Interfaces exported from the module that defines them (e.g., `AgentConfig` from `claude-code.ts`)
- Compose files in `compose/` follow naming: `docker-compose.{purpose}.yml`
- Dockerfiles in `docker/` follow naming: `{purpose}.Dockerfile`
- Non-root "agent" user (UID 1000) inside containers
- API keys via env vars at runtime, never in images

## Related Projects

- **anthropic-image-proxy**: Standalone Node.js proxy that fixes Claude Code image reading with non-Anthropic providers (llama-server, vLLM, etc.). Promotes images from `tool_result` content to user message level. Run alongside containme when using local models: `npx anthropic-image-proxy --target http://<your-model-server>`, then set `ANTHROPIC_BASE_URL=http://localhost:3456` when starting the agent.

## Current Status

- **Phase 1 COMPLETE**: CLI scaffolding, base + claude Dockerfiles, compose files (base/claude/bind), run command, path resolver, credential resolver. Builds clean, CLI works.
- **Phase 2 NEXT**: Trust levels (snapshot/git compose overlays, diff/approve commands, output-sync logic)
- See `plan.md` for full implementation plan with all 4 phases

## File Layout

```
src/index.ts                    # CLI entry (commander)
src/commands/run.ts             # Main command — stacks compose files, spawns docker compose
src/core/path-resolver.ts       # Windows D:\foo → /d/foo translation
src/core/credential-resolver.ts # API key + git identity discovery
src/core/compose-generator.ts   # Generates session override YAML
src/agents/claude-code.ts       # AgentConfig interface + claude config
src/agents/codex.ts             # Codex agent config
src/utils/platform.ts           # OS detection helpers
docker/base.Dockerfile          # Ubuntu 24.04 + dev tools base image
docker/claude.Dockerfile        # Extends base + Claude Code CLI
docker/scripts/entrypoint.sh    # Container entrypoint (secrets, git config, package install)
compose/docker-compose.yml      # Base compose (volumes, limits, host.docker.internal)
compose/docker-compose.claude.yml   # Claude agent overlay
compose/docker-compose.bind.yml     # Bind mount trust level overlay
```

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Containme**

A CLI toolkit for safely running AI coding agents (Claude Code, OpenAI Codex) inside disposable Docker containers with configurable trust levels. Solo developers point it at a project, pick how much access the agent gets to host files (`bind` for live edits, `git` for branch sync, `snapshot` for full isolation + diff/approve), and run agents with `--dangerously-skip-permissions` without risking real systems.

**Core Value:** A solo developer can let an AI agent loose on a real project and trust that, in the worst case, the host machine and source tree are untouched.

### Constraints

- **Tech stack**: TypeScript ESM (Node16) + Commander.js + Docker Compose v2 — chosen; no rewrite considered for v1
- **Container runtime**: Docker Compose (not Docker microVMs) — explicitly chosen for sufficient isolation + no 4GB cap + DevContainer compatibility
- **Volume safety (ABSOLUTE)**: Never delete `claude-data`, `codex-data`, `user-npm` volumes. Contains irreplaceable conversation history, memory, settings. Targeted `containme reset` only. (See repo `CLAUDE.md` ABSOLUTE RULES.)
- **Secrets**: API keys via env file (0600 in `os.tmpdir()`), never in images, never in compose YAML, never in argv
- **Shell-injection guard**: `CONTAINME_*_PACKAGES` env vars must remain allowlist-validated (`[a-zA-Z0-9_.+ -]` only)
- **Backwards compatibility**: Pre-1.0 — breaking CLI changes allowed with a clear release note
- **GSD install asymmetry locked-in**: Claude container clones `pedropachecog/get-shit-done` fork; Codex uses official `get-shit-done-cc@latest`. Do NOT swap Codex to the fork — explicit user instruction (memory: `feedback_codex_gsd_official_npm.md`).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ^5.7.0 — CLI source code in `src/**/*.ts`, compiled via `tsc` to `dist/`
- Bash — Container entrypoint and helper scripts in `docker/scripts/entrypoint.sh`, `docker/scripts/containme-install`
- YAML — Compose stack definitions in `compose/*.yml`, project config `containme.yml`, generated session overrides
- Dockerfile — Image definitions in `docker/base.Dockerfile`, `docker/claude.Dockerfile`, `docker/codex.Dockerfile`
## Runtime
- Node.js (host CLI) — uses `node:fs`, `node:child_process`, `node:os`, `node:path`, `node:crypto` builtins (`src/index.ts:3-5`, `src/commands/run.ts:1-5`)
- Module system: ESM (`"type": "module"` in `package.json`); imports use explicit `.js` extensions per Node16 module resolution (`tsconfig.json:4-5`)
- Compile target: ES2022 (`tsconfig.json:3`)
- Strict TypeScript with declaration + sourceMap output (`tsconfig.json:8,12-13`)
- Node.js 22 (copied from `node:22-slim` multi-stage source — `docker/base.Dockerfile:1,11-14`)
- Python 3.12 + pip + venv (`docker/base.Dockerfile:36-38`)
- `uv` Python installer (`docker/base.Dockerfile:49`)
- Ubuntu 24.04 base (`docker/base.Dockerfile:3`)
- npm (host) — Lockfile present: `package-lock.json` (~108 KB, committed)
- Inside containers: npm + globally installed `pnpm`, `yarn` (`docker/base.Dockerfile:48`); user-level npm prefix at `/home/agent/.npm-global` (`docker/base.Dockerfile:80-81`)
## Frameworks
- Commander ^13.1.0 — CLI argument parser (`src/index.ts:5`, used to declare `run`, `run-local`, `reset`, `build`, `bash` subcommands)
- @inquirer/prompts ^8.3.2 — Interactive prompts for `run-local` configuration (`src/commands/run-local.ts:1`)
- inquirer ^12.4.0 — Listed in dependencies (legacy/parallel inquirer module)
- yaml ^2.7.0 — Parses `containme.yml` and stringifies generated compose overrides (`src/index.ts:6`, `src/core/compose-generator.ts:1`, `src/core/global-config.ts:4`)
- chalk ^5.4.1 — Terminal coloring for user-facing messages (`src/commands/run-local.ts:2`)
- Vitest ^3.0.0 — Test runner (`vitest.config.ts`); tests in `test/unit/*.test.ts` and `test/integration/*.test.ts`
- Run via `npm test` (`package.json:13`) → `vitest run`; watch via `npm run test:watch`
- TypeScript compiler `tsc` — Build tool (`package.json:10`); watch mode via `npm run dev`
- No bundler — direct emission to `dist/` consumed by the `containme` bin entry (`package.json:7`)
## Key Dependencies
- `commander` ^13.1.0 — Drives the entire CLI surface area
- `yaml` ^2.7.0 — Reads project config and writes generated compose overrides
- `@inquirer/prompts` ^8.3.2 — Interactive setup for local model config
- `chalk` ^5.4.1 — Output styling
- `typescript` ^5.7.0
- `vitest` ^3.0.0
- `@types/node` ^22.13.0
- `@anthropic-ai/claude-code` — Installed at runtime by entrypoint when `CONTAINME_AGENT=claude` (`docker/scripts/entrypoint.sh:22-27`)
- `@openai/codex` — Installed at runtime by entrypoint when `CONTAINME_AGENT=codex` (`docker/scripts/entrypoint.sh:29-32`)
- `@neuledge/context` — Always installed at runtime (`docker/scripts/entrypoint.sh:34-36`)
- `@playwright/mcp` + Playwright Chromium — Browser automation MCP (`docker/base.Dockerfile:50,56-60`, `docker/scripts/entrypoint.sh:53-69`)
- `mcp-searxng` — SearXNG MCP server (`docker/scripts/entrypoint.sh:46-50`)
- `get-shit-done` (GSD) — Cloned from `https://github.com/pedropachecog/get-shit-done.git`, built and installed for Claude (`docker/scripts/entrypoint.sh:79-87`); `get-shit-done-cc@latest` from npm for Codex (`docker/scripts/entrypoint.sh:122-123`)
- `bubblewrap` — Sandboxing for Codex (`docker/codex.Dockerfile:4-5`)
- GitHub CLI `gh` (`docker/base.Dockerfile:43-47`)
- `ripgrep`, `fd-find`, `jq`, `pandoc`, `libreoffice-{writer,calc,impress}-nogui` (`docker/base.Dockerfile:17-42`)
## Configuration
- `.env` files supported (listed in `.gitignore:6`); never read by the CLI directly — secrets are pulled from `process.env`
- API keys: `ANTHROPIC_API_KEY` (Claude) / `OPENAI_API_KEY` (Codex) read from host env (`src/core/credential-resolver.ts:32-36`)
- Optional Docker secrets read inside container from `/run/secrets/anthropic_api_key`, `/run/secrets/openai_api_key` (`docker/scripts/entrypoint.sh:133-139`)
- Container-side env contract: `CONTAINME_AGENT`, `CONTAINME_SESSION_ID`, `CONTAINME_TRUST_MODE`, `CONTAINME_WORKSPACE_PATH`, `CONTAINME_PROJECT_PATH`, `CONTAINME_APT_PACKAGES`, `CONTAINME_NPM_PACKAGES`, `CONTAINME_PIP_PACKAGES` (`docker/scripts/entrypoint.sh`, `src/commands/run.ts:218-222`)
- `containme.yml` at project root — keys: `agent`, `trust`, `persist`, `isolated-caches`, `network`, `api-url`, `model`, `prompt`, `env`, `mount` (`src/index.ts:14-22,46-61`)
- `~/.containme/config.yml` — local model defaults (`api-url`, `model`) (`src/core/global-config.ts:15-16,36-48`)
- `tsconfig.json` — Strict, ES2022, Node16 modules, sourcemaps, declarations
- `vitest.config.ts` — Test glob `test/**/*.test.ts`
- `.dockerignore`, `.gitignore` — exclude `node_modules/`, `dist/`, `.containme/`, `.worktrees/`, `*.tgz`, `.env`, `.claude/settings.local.json`
## Platform Requirements
- Node.js (host) capable of running `tsc` 5.7 and Vitest 3
- Docker Engine + `docker compose` v2 plugin (CLI shells out to `docker compose -f ... run --rm` — `src/commands/run.ts:225-249`)
- `git` on PATH for `git config` lookups in credential resolver (`src/core/credential-resolver.ts:17-22`)
- Optional: GitHub CLI `gh` for token extraction (`src/core/credential-resolver.ts:51-58`)
- Windows path translation lives in `src/core/path-resolver.ts` (Windows `D:\foo` → Docker `/d/foo`); detection via `src/utils/platform.ts`
- This package itself is the deliverable — published as a CLI (`package.json:6-8`, `bin: containme → ./dist/index.js`)
- License: MIT (`package.json:24`)
- Version: 0.1.0 (`package.json:3`)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case for all TypeScript source files: `path-resolver.ts`, `credential-resolver.ts`, `compose-generator.ts`
- Test files mirror source name with `.test.ts` suffix: `path-resolver.test.ts`
- Dockerfiles follow `{purpose}.Dockerfile` (e.g., `base.Dockerfile`, `claude.Dockerfile`) — see `docker/`
- Compose files follow `docker-compose.{purpose}.yml` (e.g., `docker-compose.claude.yml`, `docker-compose.bind.yml`) — see `compose/`
- camelCase for function names: `resolveProjectPath`, `generateComposeOverride`, `validateResetArgs`, `tryGitConfig`
- Verb-first naming: `resolve*`, `generate*`, `validate*`, `build*`, `try*`
- Pure helper functions exported alongside command handlers (e.g., `displayPath`, `filterContainers` in `src/commands/bash.ts`)
- camelCase for locals and parameters: `resolvedPath`, `secretsFilePath`, `sessionId`
- SCREAMING_SNAKE_CASE for module-level constants: `VALID_TRUSTS`, `VALID_AGENTS`, `VALID_NETWORKS`, `FORBIDDEN_MOUNT_TARGETS` in `src/commands/run.ts`
- Constant maps use SCREAMING_SNAKE_CASE keys (`AGENT_VOLUME`, `AGENT_HOME` in `src/commands/reset.ts`)
- PascalCase for interfaces and type aliases: `AgentConfig`, `RunOptions`, `Credentials`, `RunCommandOptions`, `ContainmeContainer`, `ResetCommand`, `ValidationResult`
- No `I` prefix on interfaces
- Literal union types declared via `as const` tuples and indexed for the type alias: `type ResetTarget = (typeof VALID_TARGETS)[number];` (`src/commands/reset.ts:20`)
## Code Style
- No formatter config detected (no `.prettierrc`, no `biome.json`)
- De facto style observed across `src/`:
- No linter configured (no `.eslintrc*`, no `eslint.config.*`)
- TypeScript `strict: true` is the only static-analysis gate (`tsconfig.json:8`)
## Import Organization
- None. Relative paths only (`../core/`, `../utils/`, `./commands/`).
- All relative imports MUST end in `.js` even though source files are `.ts` (Node16 module resolution requirement).
- Example: `import { runCommand } from "./commands/run.js";` in `src/index.ts:7`
## Error Handling
- Throw plain `Error` with descriptive messages for invalid input — `throw new Error(\`Unknown agent: ${name}\`)` in `src/commands/run.ts:38`
- Validation functions throw on failure rather than returning result objects (exception: `validateResetArgs` in `src/commands/reset.ts:42` returns `{ skip, message }` for the codex+mcp soft-skip case)
- Wrap external command calls in try/catch and return `undefined`/empty on failure — see `tryGitConfig` (`src/core/credential-resolver.ts:17`) and `loadConfig` (`src/index.ts:14`)
- `execSync` calls that may fail are individually wrapped with comments explaining the silent fallback (`src/core/credential-resolver.ts:51-58`)
- Tests assert thrown errors via `.rejects.toThrow(/regex/)` or `expect(() => ...).toThrow(...)` — see `test/unit/validation.test.ts`, `test/unit/reset.test.ts`
## Logging
- `chalk` (^5.4.1, see `package.json:27`) is available for colored output
- No structured logging; CLI prints human-readable messages
## Comments
- JSDoc-style block comments above exported functions describing purpose and side effects, especially around platform-specific behavior — see `resolveProjectPath` (`src/core/path-resolver.ts:4-10`) and `generateSecretsEnvFile` (`src/core/compose-generator.ts:22-25`)
- Inline `// ----` banner separators divide files into logical sections (Constants / Helpers / Command handler) — see `src/commands/run.ts:16-30` and `src/commands/reset.ts:13-35`
- Inline comments explain non-obvious security or platform decisions (e.g., `// NO SECRETS here` in `src/core/compose-generator.ts:67`)
- Used selectively for exported helpers, not enforced
- Single-line `/** ... */` style preferred for short descriptions
## Function Design
- Most functions are short (5-30 lines). The largest pure function (`generateComposeOverride` in `src/core/compose-generator.ts:52-151`) builds an object incrementally with section comments.
- Functions taking >2 parameters use a single options object with a named interface (e.g., `RunOptions`, `RunCommandOptions`, filter opts in `filterContainers`)
- Destructuring at function entry is the norm: `const { agent, trust, network, ... } = options;`
- Pure helpers return values directly; never mutate parameters
- Async command handlers return `Promise<void>` and rely on side effects (spawn, file I/O)
- Discriminated unions for "what to do next" results — see `resolveBashTarget` returning `{ action: "exec" | "fresh" | "pick", ... }` in `src/commands/bash.ts`
## Module Design
- Named exports only; no `default` exports anywhere in `src/`
- Interfaces are exported from the module that owns them and re-imported via `import type` (e.g., `AgentConfig` from `src/agents/claude-code.ts`, `RunOptions` from `src/core/compose-generator.ts`, `Credentials` from `src/core/credential-resolver.ts`)
- None. Each module is imported directly by path.
## Validation Patterns
- Allowed-value lists declared as `as const` tuples and checked via `.includes` against a `readonly string[]` cast — see `VALID_TRUSTS` / `VALID_AGENTS` in `src/commands/run.ts:20-22` and `src/commands/reset.ts:17-18`
- Path-target denylists (e.g., `FORBIDDEN_MOUNT_TARGETS`) checked with both equality and `startsWith(forbidden + "/")` to prevent prefix bypass — `src/commands/run.ts:62-66`
## Platform-Awareness
- All platform-specific branches go through `src/utils/platform.ts` helpers (`isWindows`, `isWSL`, `getShell`)
- Never read `process.platform` directly in feature code; mock `isWindows` in tests instead — see the `vi.mock` pattern in `test/unit/path-resolver.test.ts:5-7`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
## Component Responsibilities
| Component | Responsibility | File |
|-----------|----------------|------|
| CLI router | Define commands, parse flags, load `containme.yml` defaults | `src/index.ts` |
| `run` command | Orchestrate a session: resolve paths/creds, generate override, build images, spawn `docker compose run` | `src/commands/run.ts` |
| `run-local` command | Wrap `run` with persisted local-LLM config (api-url + model) | `src/commands/run-local.ts` |
| `reset` command | Targeted reset of agent volume contents (auth/mcp/cache) without destroying volumes | `src/commands/reset.ts` |
| `build` command | Compile TS, build base image, build per-agent images | `src/commands/build.ts` |
| `bash` command | List/attach to running session containers; fallback to fresh shell | `src/commands/bash.ts` |
| Path resolver | Translate Windows `D:\foo` → Docker-compatible `/d/foo` | `src/core/path-resolver.ts` |
| Credential resolver | Discover API key, git identity, GitHub token, host `.claude.json` | `src/core/credential-resolver.ts` |
| Compose generator | Emit per-session override YAML + secrets env file | `src/core/compose-generator.ts` |
| Global config | Load/save `~/.containme/config.yml` (local model defaults) | `src/core/global-config.ts` |
| Agent registry | `AgentConfig` interface + `claudeCodeConfig` / `codexConfig` | `src/agents/claude-code.ts`, `src/agents/codex.ts` |
| Platform utils | `isWindows()`, `isWSL()`, `getShell()` | `src/utils/platform.ts` |
| Package-root locator | Walk up from compiled file to find package.json | `src/utils/package-root.ts` |
| Container entrypoint | Install agent CLIs, configure MCP servers, GSD, git, secrets — runs inside container on every start | `docker/scripts/entrypoint.sh` |
## Pattern Overview
- Thin command handlers in `src/commands/` delegate to small, pure helpers in `src/core/`.
- Configuration is composed by *stacking* compose files via repeated `-f` flags rather than mutating a single file. The base + agent + trust files are static (committed); the session override is generated per run.
- All host/container coupling is funneled through three resolvers: `path-resolver`, `credential-resolver`, `compose-generator`. The rest of the code is platform-agnostic.
- The CLI never executes container logic in-process; it always shells out to `docker` / `docker compose` via `child_process.spawn`.
- Secrets are written to a 0600 file in `os.tmpdir()` and referenced via compose `env_file`. Secrets never appear in the override YAML, never in env vars on the CLI invocation, never in the project directory.
## Layers
- Purpose: argv parsing, defaults merging from `containme.yml`, dispatch to a command handler.
- Location: `src/index.ts`
- Contains: commander program definition, `loadConfig()`, `collect()`.
- Depends on: `commands/*`.
- Used by: the `containme` bin (npm `bin` → `dist/index.js`).
- Purpose: one file per top-level CLI verb. Validates inputs, orchestrates core helpers, spawns docker.
- Location: `src/commands/`
- Contains: `run.ts`, `run-local.ts`, `reset.ts`, `build.ts`, `bash.ts`.
- Depends on: `src/core/*`, `src/agents/*`, `src/utils/*`.
- Used by: `src/index.ts`.
- Purpose: pure or near-pure helpers — path translation, credential discovery, YAML generation, global config persistence.
- Location: `src/core/`
- Contains: `path-resolver.ts`, `credential-resolver.ts`, `compose-generator.ts`, `global-config.ts`.
- Depends on: `src/utils/*`, `src/agents/*` (types only).
- Used by: command layer.
- Purpose: declarative configs for each supported agent (compose file name, env var names, default command).
- Location: `src/agents/`
- Contains: `claude-code.ts` (defines `AgentConfig` interface), `codex.ts`.
- Used by: command layer, compose-generator.
- Purpose: leaf utilities (no dependencies on other layers).
- Location: `src/utils/`
- Contains: `platform.ts`, `package-root.ts`.
- Purpose: declarative container surface.
- Location: `compose/`, `docker/`, `docker/scripts/entrypoint.sh`.
- Contains: base + per-agent + per-trust compose files; base + per-agent Dockerfiles; entrypoint shell script.
## Data Flow
### Primary `run` Path
### Container Startup Flow (inside container)
### `bash` Attach Flow
- No in-memory shared state across invocations. Every command runs as a fresh Node process.
- Persistent state lives in named Docker volumes (`claude-data`, `codex-data`, `user-npm`, `npm-cache`, `pip-cache`, `cargo-cache`) and the user's `~/.containme/config.yml`.
- Per-session state: `<project>/.containme/docker-compose.override.<sessionId>.yml` (cleaned up on exit) and the secrets env file in `os.tmpdir()` (cleaned up on exit).
- Container labels (`containme.session`, `containme.agent`, `containme.trust`, `containme.project`) are the source of truth for `bash` attach — they survive across CLI invocations.
## Key Abstractions
- Purpose: declarative description of an agent (compose overlay file, env var names, default CLI command).
- Examples: `src/agents/claude-code.ts:1-9` (interface), `:11-19` (claude instance), `src/agents/codex.ts:3-11`.
- Pattern: data-only objects swapped in by name in `agentConfigFor()` (`src/commands/run.ts:31-40`).
- Purpose: full description of one session — agent, trust, network, mounts, credentials, sessionId, paths.
- Defined: `src/core/compose-generator.ts:5-20`.
- Used by: `generateComposeOverride()`.
- Purpose: resolved auth/identity for a session.
- Defined: `src/core/credential-resolver.ts:7-15`.
- Fields: `apiKey`, `apiUrl`, `gitUserName`, `gitUserEmail`, `githubToken`, `claudeConfigPath`.
- Purpose: parsed `docker ps` row enriched with labels for the `bash` attach flow.
- Defined: `src/commands/bash.ts:11-19`.
- `bind` (default): live read-write bind mount of project (`compose/docker-compose.bind.yml`).
- `git`: clone host repo into a per-session branch inside the container (entrypoint hook).
- `snapshot`: planned (Phase 2 per `plan.md`).
- Validated against `VALID_TRUSTS` (`src/commands/run.ts:20`).
## Entry Points
- Location: `src/index.ts` (compiled to `dist/index.js`, registered via npm `bin` in `package.json:6-8`).
- Triggers: user invocation.
- Responsibilities: argv parsing → command dispatch.
- Location: `docker/scripts/entrypoint.sh`, copied into base image at `/usr/local/bin/entrypoint.sh`.
- Triggers: every `docker compose run` invocation (set as `ENTRYPOINT` in `docker/base.Dockerfile:88`).
- Responsibilities: in-container bootstrap before exec'ing the agent CLI.
- Location: `docker/scripts/containme-install` (copied to `/usr/local/bin/containme-install` in `docker/base.Dockerfile:70`).
- Triggers: invoked manually inside containers when an agent needs to install host packages.
## Architectural Constraints
- **Threading:** single-threaded Node event loop. All blocking work is delegated to spawned subprocesses (`spawnAsync`) or to `execSync` for short reads (`git config`, `gh auth token`).
- **No CLI-side persistent state:** every invocation re-resolves credentials and re-generates the compose override. There is no daemon, no state file written by the CLI other than `~/.containme/config.yml` (only by `run-local`) and per-session ephemeral files.
- **Compose stacking is order-sensitive:** files are passed as `-f base -f agent -f trust -f override`. Later files override earlier ones. The override file is the only place where dynamic values (session ID, container name, model flag, env file path, isolated cache volume names) are injected.
- **Volume names are sacred:** `claude-data`, `codex-data`, and `user-npm` are persistent across sessions and contain irreplaceable user data. `reset` operates *inside* these volumes via `containme-base` + `-v <volume>:<path>` (`src/commands/reset.ts:181`). Never `docker volume rm`.
- **Windows path translation only happens in `resolveProjectPath()`** (`src/core/path-resolver.ts:11`). All other code receives already-translated forward-slash paths via `dockerProjectPath`.
- **Package root discovery walks up from `import.meta.url`** so the CLI works whether installed globally, run from `dist/`, or invoked via `npx` (`src/utils/package-root.ts:5-13`).
- **Mount targets are denylist-validated** against `/`, `/etc`, `/proc`, `/sys`, `/run`, `/dev` to prevent host takeover via `--mount` (`src/commands/run.ts:24, 56-67`).
- **Package-name shell-injection guard** in `entrypoint.sh:5-11` — only `[a-zA-Z0-9_.+ -]` accepted in `CONTAINME_APT_PACKAGES`, `CONTAINME_NPM_PACKAGES`, `CONTAINME_PIP_PACKAGES`.
## Anti-Patterns
### Writing secrets into the compose override
### Deleting the agent's persistent Docker volume to "fix" auth/state
### Mutating host paths without translating for Docker Desktop on Windows
### Hardcoding agent assumptions in command handlers
### Skipping cleanup on error paths
## Error Handling
- Validation throws synchronously before any IO (`src/commands/run.ts:91-99`).
- `spawnAsync()` rejects on spawn error, resolves with the child's exit code on close (`src/commands/run.ts:43-53`, mirrored in `commands/build.ts:10-20` and `commands/reset.ts:151-161`).
- Best-effort cleanup is wrapped in nested `try/catch` to swallow secondary errors (`src/commands/run.ts:184-199`).
- Optional host commands (`git config`, `gh auth token`) are wrapped in `try/catch` and silently fall back (`src/core/credential-resolver.ts:17-23, 51-57`).
- Signal handlers are *named* (not anonymous), self-removing, and propagate the signal to the child before exiting with the conventional 130/143 codes (`src/commands/run.ts:272-285`).
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

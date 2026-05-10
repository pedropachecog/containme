# containme

Run AI coding agents — Claude Code and OpenAI Codex — safely inside disposable Docker containers with persistent agent data. Point it at a project, get a live read-write `bind` mount of your code into the container, and run agents with `--dangerously-skip-permissions` (Claude) or `--dangerously-bypass-approvals-and-sandbox` (Codex) without risking your real system. Pairs with [anthropic-image-proxy](https://github.com/pedropachecog/anthropic-image-proxy) for image-aware local-model workflows.

See [ROADMAP.md](./ROADMAP.md) for upcoming trust levels and isolation features.

> **Volume safety (absolute rule).** containme **never** deletes the named volumes that hold your agent's credentials, conversation history, memory, or settings (`claude-data`, `codex-data`, `user-npm`). Use `containme reset` for surgical resets — never `docker volume rm`.

## Requirements

- Docker Desktop (Windows/Mac) or Docker Engine + Docker Compose v2 (Linux/WSL)
- Node.js 22+ on the host (to compile and run the CLI)
- npm
- Optional: GitHub CLI (`gh`) on the host — used to forward your GitHub token into the container
- Optional: a SearXNG instance reachable at `http://host.docker.internal:8086` for the SearXNG MCP

## Install

```bash
git clone https://github.com/pedropachecog/containme
cd containme
npm install
npm run build        # compile TypeScript → dist/
npm link             # register the `containme` command globally
containme build      # build the base + agent Docker images
```

`containme build` recompiles TypeScript and (re)builds the base image plus all agent images. Run it again whenever you pull updates or change Dockerfiles.

If you'd rather skip `npm link`, run the CLI directly:

```bash
node dist/index.js build
node dist/index.js run .
```

## Quickstart

```bash
# Claude Code on the current directory (bind mount, full network)
containme run .

# Codex on a specific project
containme run --agent codex /path/to/project

# Local-model workflow (Anthropic-compatible proxy on host port 3456)
npx anthropic-image-proxy --target http://10.0.0.5:8000 --verbose   # one terminal
containme run-local .                                               # another terminal
```

First run prompts for your local API URL and model name, then saves them to `~/.containme/config.yml` so future `run-local` invocations are zero-prompt.

## Commands reference

### `containme run [project-path]`

Build and start an agent session. The project path defaults to `.`.

| Flag | Default | Description |
|------|---------|-------------|
| `-a, --agent <agent>` | `claude` | Agent to use (`claude` or `codex`) |
| `-t, --trust <level>` | `bind` | Trust level — `bind` is the only implemented value today |
| `--isolated-caches` | `false` | Use session-scoped npm/pip/cargo cache volumes (cleaned up on exit) |
| `--network <mode>` | `full` | Network mode (`full` or `none`) |
| `--api-url <url>` | — | Custom API base URL — used by local-model setups |
| `--model <model>` | — | Model name override (e.g. `unsloth/Qwen3-Coder-Next`); appended to the agent's default command |
| `--prompt <prompt>` | — | Initial prompt to send to the agent |
| `-e, --env <var>` | — | Environment variable to forward (repeatable). `KEY=VALUE` sets a literal value; `KEY` alone forwards from the host environment |
| `-m, --mount <mount>` | — | Extra bind mount in `host:container[:opts]` form (repeatable). Mount targets `/`, `/etc`, `/proc`, `/sys`, `/run`, `/dev` are rejected |

Project-level defaults from `containme.yml` are loaded first; CLI flags always win.

### `containme run-local [project-path]`

Same as `run`, but resolves `--api-url` and `--model` from `~/.containme/config.yml` (prompts on first use), and runs through the local-model workflow.

| Flag | Default | Description |
|------|---------|-------------|
| `-a, --agent <agent>` | `claude` | Agent to use (`claude` or `codex`) |
| `-t, --trust <level>` | `bind` | Trust level (`bind`) |
| `--isolated-caches` | `false` | Session-scoped caches |
| `--network <mode>` | `full` | Network mode (`full` or `none`) |
| `--api-url <url>` | saved | Override the saved API URL for this run |
| `--model <model>` | saved | Override the saved model name for this run |
| `--prompt <prompt>` | — | Initial prompt to send to the agent |
| `-e, --env <var>` | — | Environment variable to forward (repeatable) |
| `-m, --mount <mount>` | — | Extra bind mount (repeatable) |
| `--reconfigure` | `false` | Re-prompt for API URL and model and overwrite the saved config |

### `containme bash [project-path]`

Open a shell. If a containme-labelled container is running for the given project, exec into it; otherwise start a fresh, throwaway shell with the same volumes and credentials. No need to start a full agent session first.

| Flag | Description |
|------|-------------|
| `-a, --agent <agent>` | Filter by agent (`claude` or `codex`) |
| `-c, --command <cmd>` | Run a single command non-interactively instead of an interactive shell |
| `--as-agent` | Exec as the `agent` user (UID 1000) instead of the default `root` |

If multiple containers match, an interactive picker is shown.

### `containme build`

Compile TypeScript then rebuild the base image and agent images.

| Flag | Description |
|------|-------------|
| `-a, --agent <agent>` | Build only one agent image (`claude` or `codex`); default is all |

### `containme reset <target>`

Targeted reset that operates **inside** the persistent agent volume — the volume itself is never destroyed.

| Flag | Default | Description |
|------|---------|-------------|
| `-a, --agent <agent>` | `claude` | Which agent's data to reset (`claude` or `codex`) |

| Target | Claude | Codex |
|--------|--------|-------|
| `auth` | Deletes `~/.claude/.credentials.json` | Deletes `~/.codex/auth.json` |
| `mcp` | Removes `mcpServers` from `~/.claude/.claude.json` | Not applicable — prints a message and exits cleanly |
| `cache` | Removes `cache/`, `statsig/`, `telemetry/`, `debug/`, `paste-cache/`, `downloads/`, `stats-cache.json` | Removes `~/.codex/log/` |

## Project config file (`containme.yml`)

Drop a `containme.yml` at your project root to set defaults. CLI flags always override it.

```yaml
agent: claude                   # claude | codex
trust: bind                     # bind
isolated-caches: false          # bool
network: full                   # full | none
api-url: http://host.docker.internal:3456
model: unsloth/Qwen3-Coder-Next
prompt: "Continue where we left off."
env:                            # list of KEY=VALUE or KEY (forwarded from host)
  - SEARXNG_URL=http://host.docker.internal:8086
  - GITHUB_TOKEN
mount:                          # extra bind mounts in host:container[:opts] form
  - /home/me/notes:/workspace/notes:ro
```

The CLI reads the file with `yaml`'s `parse`; missing or unparseable files are silently ignored.

## Trust level

The agent gets a live read-write bind mount of your project at `/workspace`. Edits are immediate on the host. This is the only trust level shipped today; additional isolation modes (`snapshot`, `git`) are tracked in [ROADMAP.md](./ROADMAP.md).

## Persistent data (named volumes)

Agent data lives in named Docker volumes. **containme never deletes these** automatically.

| Volume | Mount (inside container) | Defined in | Contains |
|--------|--------------------------|------------|----------|
| `claude-data` | `/home/agent/.claude` | `compose/docker-compose.claude.yml` | Claude credentials, settings, conversation history, memory, MCP config, `.claude.json` |
| `codex-data` | `/home/agent/.codex` | `compose/docker-compose.codex.yml` | Codex auth, `config.toml`, history, logs |
| `user-npm` | `/home/agent/.npm-global` | `compose/docker-compose.claude.yml`, `compose/docker-compose.codex.yml` | User-installed npm packages — agent CLIs (Claude Code, Codex), MCP servers, `containme-install` package list |
| `npm-cache` | `/home/agent/.npm` | `compose/docker-compose.yml` | npm package cache (shared across sessions; speeds up installs) |
| `pip-cache` | `/home/agent/.cache/pip` | `compose/docker-compose.yml` | pip package cache |
| `cargo-cache` | `/home/agent/.cargo/registry` | `compose/docker-compose.yml` | Cargo registry cache |

`--isolated-caches` swaps the three cache volumes for session-scoped names (`containme-npm-<sid>`, `containme-pip-<sid>`, `containme-cargo-<sid>`) and removes them on exit. The persistent agent volumes (`claude-data`, `codex-data`, `user-npm`) are never affected.

## Built-in capabilities

### Pre-installed in the base image (both agents)

- Ubuntu 24.04 base, non-root `agent` user (UID 1000)
- Node.js 22 (copied from `node:22-slim`, no curl-pipe install)
- Python 3.12 + `pip` + `python3.12-venv`, plus `uv`
- npm globals: `pnpm`, `yarn`
- `git`, GitHub CLI (`gh`), `ripgrep`, `fd-find`, `jq`, `curl`, `wget`, `unzip`, `zip`, `openssh-client`, `build-essential`, `gcc`, `g++`, `make`, `cmake`
- Pandoc — universal document converter (Markdown ↔ DOCX, HTML, etc.)
- LibreOffice headless — Writer, Calc, Impress (`-nogui` variants) for DOCX→PDF and layout checks
- Playwright + Chromium with `--no-sandbox` glue, plus a `/opt/google/chrome/chrome` symlink so Playwright MCP can find Chrome
- `bubblewrap` (Codex image only)
- `containme-install` helper for persistent apt installs

### Claude container (registered by `entrypoint.sh` on first start)

- `@anthropic-ai/claude-code` — installed at runtime into `/home/agent/.npm-global` so its built-in auto-update keeps working
- `@neuledge/context` — installed globally; registered as the `context` MCP via `claude mcp add context -- context serve`
- `searxng` MCP via `mcp-searxng` — points at `http://host.docker.internal:8086`. Run a SearXNG instance on the host or override the URL with `-e SEARXNG_URL=...`
- `playwright` MCP via `@playwright/mcp` — pre-configured with `chromiumSandbox: false` and `--no-sandbox` for in-container browsers
- `get-shit-done` (GSD) — installed from the **`pedropachecog/get-shit-done` GitHub fork** (cloned, built, and `node bin/install.js --claude --global` on every start). GSD commands in `~/.claude/commands/gsd/*.md` are mirrored to `~/.claude/skills/gsd:<name>/SKILL.md` so Claude Code's Skill tool sees them.

### Codex container

- `@openai/codex` — installed at runtime into `/home/agent/.npm-global`
- `@neuledge/context` — registered as an MCP server via an idempotent append to `~/.codex/config.toml`
- `get-shit-done` — installed from the **official `get-shit-done-cc@latest` npm package** (`npx get-shit-done-cc@latest --codex --global`). Codex deliberately uses the official npm release, not the fork — do not swap this.

> Asymmetry note: the Claude container intentionally pulls GSD from a personal GitHub fork, while Codex uses the official npm package. Both are first-class — don't try to "normalize" them.

## Installing extra apt / npm / pip packages

Containers are ephemeral, so packages installed at runtime disappear on container recreate. Three options:

### `containme-install` — apt with persistence

```bash
# inside a containme container
containme-install pandoc imagemagick
```

Installs immediately via `sudo apt-get install -y` (sudo is allow-listed for `apt`/`apt-get`/`chown` only) and records each name in `/home/agent/.npm-global/.containme-apt-packages`. On every future container start, `entrypoint.sh` reinstalls anything from that list that isn't already present. Package names are validated against `[a-zA-Z0-9_.+-]` to block shell metacharacters.

### Per-session env var (no persistence)

```bash
containme run -e CONTAINME_APT_PACKAGES="imagemagick texlive-base" .
containme run -e CONTAINME_NPM_PACKAGES="prettier eslint" .
containme run -e CONTAINME_PIP_PACKAGES="black ruff" .
```

`entrypoint.sh` validates each list with the same allowlist regex (`[a-zA-Z0-9_.+ -]`) and installs the packages on startup. They're not persisted — the next container start without the env var won't have them.

## Installing MCP servers

Always install MCPs as the **agent user** so they land on the persistent `user-npm` volume:

```bash
containme bash --as-agent
npm install -g <mcp-package>
claude mcp add <name> -- <command>
```

If you `npm install -g` as `root`, the package goes to `/root/.npm-global` (or wherever root's prefix points) inside an ephemeral filesystem and disappears on the next container recreate.

`@neuledge/context`, `searxng`, and `playwright` are pre-registered for Claude on first start. For Codex, only `context` is wired up by default.

## Local-model workflow

Local LLM servers (llama.cpp, vLLM, etc.) speak OpenAI's Chat Completions format, but Claude Code calls Anthropic's API and reads images from `tool_result` content blocks. Local servers either reject those images or silently drop them — so Claude Code can't see screenshots when pointed straight at, e.g., llama-server.

[anthropic-image-proxy](https://github.com/pedropachecog/anthropic-image-proxy) sits between Claude Code and the local model and rewrites image-bearing tool results into user-message content the local model can actually see. `containme run-local` defaults `--api-url` to `http://host.docker.internal:3456`, which is where the proxy listens by default.

```bash
# 1. Start the proxy on the host, pointing at your local model server
npx anthropic-image-proxy --target http://10.0.0.5:8000 --verbose

# 2. Start the agent — first run prompts and saves api-url + model to ~/.containme/config.yml
containme run-local .

# 3. Re-prompt later if the model or proxy URL changes
containme run-local --reconfigure .
```

Config lives at `~/.containme/config.yml` under a `local:` key with `api-url` and `model`.

## Architecture

containme is a thin TypeScript CLI that **stacks Docker Compose files** rather than mutating a single one. Every `containme run` invocation:

```
containme run .
    │
    ├── resolves project path (Windows D:\foo → /run/desktop/mnt/host/d/foo on Docker Desktop)
    ├── resolves credentials (env → git config → gh auth token → host ~/.claude.json)
    ├── writes secrets env file to $TMPDIR/containme-secrets-<sid>.env (mode 0600)
    ├── generates .containme/docker-compose.override.<sid>.yml (NO secrets in this file)
    ├── builds containme-base (Ubuntu 24.04 + Node + dev tools + Playwright)
    ├── builds the agent image (FROM containme-base + agent CLI + envs)
    └── docker compose run --rm --service-ports agent
            -f compose/docker-compose.yml          (volumes, caps, host.docker.internal, limits)
            -f compose/docker-compose.<agent>.yml  (claude or codex overlay)
            -f compose/docker-compose.<trust>.yml  (currently only bind)
            -f .containme/docker-compose.override.<sid>.yml  (env, mounts, env_file, labels)
```

Compose files are read in order; later files override earlier ones. The override file is where everything dynamic lives: container labels (`containme.session/agent/trust/project`), env vars, extra mounts, the `env_file` reference, optional model flag, and (with `--isolated-caches`) per-session cache volume names. Cleanup on exit removes the override YAML, the secrets env file, and any session-scoped cache volumes.

**Session IDs** are 128-bit random hex (`crypto.randomBytes(16).toString("hex")`).

**Secrets** (API keys, GitHub token) are written exclusively to `$TMPDIR/containme-secrets-<sid>.env` with mode `0600` and referenced via Compose `env_file:`. They never appear in the override YAML, never in the project directory, and never on the `docker` argv.

## Security boundaries

- Agent runs as non-root user `agent` (UID 1000)
- Linux capabilities dropped to `ALL`, then re-added: `CHOWN`, `SETUID`, `SETGID`, `DAC_OVERRIDE` only
- `sudo` allow-list is `apt`, `apt-get`, `chown`, `/bin/chown` (no shell, no `apt-key`, etc.)
- Resource limits: `mem_limit: 8g`, `cpus: 4`, `pids_limit: 4096`, `shm_size: 2gb`
- Forbidden mount targets (rejected before spawn): `/`, `/etc`, `/proc`, `/sys`, `/run`, `/dev` — also blocks any subpath under those prefixes
- Package-name allowlist regex (`[a-zA-Z0-9_.+ -]` for env-var lists, `[a-zA-Z0-9_.+-]` per-package in `containme-install`) — rejects shell metacharacters before any `apt-get install`
- API keys live in a `0600` env file in `$TMPDIR` and are referenced via `env_file:`; never in argv, never in the override YAML, never in the project directory
- 128-bit random session IDs (`randomBytes(16)`)
- `git config --global --add safe.directory '*'` is set inside the container only — needed because bind-mounted host paths trip Git's "dubious ownership" check
- Network mode `none` adds `--no-deps` to `docker compose run`

## File layout

```
src/
  index.ts                       CLI entry — Commander.js, loads containme.yml, dispatches
  commands/
    run.ts                       containme run — validation, build, compose-run, cleanup
    run-local.ts                 containme run-local — prompts + saves global model config
    reset.ts                     containme reset auth|mcp|cache
    build.ts                     containme build — tsc + base + agent images
    bash.ts                      containme bash — list/attach or fresh shell
  core/
    compose-generator.ts         RunOptions → override YAML + secrets env file
    credential-resolver.ts       Resolves API key + git identity + GitHub token + host .claude.json
    path-resolver.ts             Windows D:\foo → /run/desktop/mnt/host/d/foo translation
    global-config.ts             ~/.containme/config.yml read/write
  agents/
    claude-code.ts               Claude AgentConfig (defines the AgentConfig interface)
    codex.ts                     Codex AgentConfig
  utils/
    platform.ts                  isWindows / isWSL / getShell
    package-root.ts              walk up from import.meta.url to find package.json

docker/
  base.Dockerfile                Ubuntu 24.04 + Node 22 + Python 3.12 + Playwright + Pandoc + LibreOffice + dev tools
  claude.Dockerfile              FROM containme-base + CLAUDE_CONFIG_DIR + CONTAINME_AGENT=claude
  codex.Dockerfile               FROM containme-base + bubblewrap + CODEX_HOME + CONTAINME_AGENT=codex
  scripts/
    entrypoint.sh                MCP registration, agent CLI install, GSD install, secrets, package restore
    containme-install            Persistent apt install with name validation

compose/
  docker-compose.yml             Base service (volumes, caps, limits, host.docker.internal)
  docker-compose.claude.yml      Claude overlay (claude-data + user-npm volumes, ANTHROPIC_API_KEY)
  docker-compose.codex.yml       Codex overlay (codex-data + user-npm volumes, OPENAI_API_KEY)
  docker-compose.bind.yml        Bind trust overlay (mounts ${CONTAINME_PROJECT_PATH} → /workspace)

containme.yml                    (Optional) per-project defaults
```

## Development

```bash
npm install
npm run build         # compile TypeScript only → dist/
npm run dev           # tsc --watch
npm test              # run vitest test suite once
npm run test:watch    # vitest watch mode
containme build       # full rebuild: tsc + base + agent images
```

Tests live in `test/unit/*.test.ts` and `test/integration/*.test.ts` and run via Vitest.

## License

MIT — see `package.json`.

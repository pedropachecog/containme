# containme

Run AI coding agents (Claude Code, OpenAI Codex) safely inside Docker containers with configurable trust levels and persistent agent data.

## Why

AI agents can delete files, run arbitrary commands, and make irreversible changes. containme wraps them in Docker containers so they can't touch your host system. Agent data (credentials, conversation history, memory) persists across sessions in named volumes that are never deleted automatically.

## Requirements

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Node.js 22+
- npm

## Install

```bash
git clone https://github.com/pedropachecog/containme
cd containme
npm install
npm run build        # compile TypeScript → dist/
npm link             # register the `containme` command globally
containme build      # build Docker images
```

`containme build` compiles TypeScript and builds all Docker images. Run it again any time you update containme.

If you prefer not to use `npm link`, use `node dist/index.js` directly:

```bash
node dist/index.js build
node dist/index.js run .
# etc.
```

## Usage

### Run Claude Code on a project

```bash
containme run /path/to/your/project
containme run .                        # current directory
```

### Run Codex

```bash
containme run --agent codex .
```

### Run with a local model server

```bash
containme run-local .
# Prompts for API URL and model name on first run, saves globally
# Subsequent runs use saved config — no prompts

containme run-local --reconfigure .   # re-prompt to change saved config
```

The default API URL is `http://host.docker.internal:3456`, which points at [anthropic-image-proxy](https://github.com/pedropachecog/anthropic-image-proxy) running on the host. Start the proxy before running:

```bash
# In one terminal — start the proxy pointing at your model server
npx anthropic-image-proxy --target http://10.0.0.5:8000 --verbose

# In another terminal — run the agent
containme run-local .
```

The proxy fixes Claude Code image reading with non-Anthropic providers (llama-server, vLLM, etc.) by promoting images from `tool_result` content to user message level, where local models can see them.

### Open a shell in a running container

```bash
containme bash                        # matches container for current directory (runs as root)
containme bash /path/to/project       # match by project path
containme bash --agent codex          # filter by agent type
containme bash -c "gh auth status"    # run a single command non-interactively
containme bash --as-agent             # exec as the agent user (UID 1000) instead of root
```

If a matching session is already running, execs into it. If not, starts a fresh throwaway shell with the same volumes and credentials — no need to start a full agent session first.

If multiple containers match, an interactive picker is shown.

### Rebuild Docker images

```bash
containme build                       # compile TypeScript + rebuild all agent images
containme build --agent claude        # rebuild only the Claude image
```

Run after pulling updates or changing Dockerfiles.

### Reset agent configuration (without deleting data)

```bash
containme reset auth                  # delete credentials → re-authenticate next run
containme reset mcp                   # clear MCP server registrations
containme reset cache                 # clear transient cache directories
containme reset auth --agent codex    # reset Codex credentials
```

Reset never deletes conversation history, memory, plans, or settings.

## Options

### `containme run [project-path]`

| Flag | Default | Description |
|------|---------|-------------|
| `-a, --agent <agent>` | `claude` | Agent to use (`claude` or `codex`) |
| `-t, --trust <level>` | `bind` | Trust level (`bind` only; `snapshot`/`git` not yet implemented) |
| `-p, --persist` | false | Persist container between sessions |
| `--isolated-caches` | false | Fresh npm/pip/cargo cache each session |
| `--network <mode>` | `full` | Network mode (`full`, `none`; `limited` not yet implemented) |
| `--api-url <url>` | — | Custom API base URL (for local models) |
| `--model <model>` | — | Model name override |
| `--prompt <text>` | — | Initial prompt to send the agent |
| `-e, --env <KEY=VAL>` | — | Extra env vars (repeatable) |
| `-m, --mount <path>` | — | Extra bind mounts (repeatable) |

### `containme bash [project-path]`

| Flag | Description |
|------|-------------|
| `-a, --agent <agent>` | Filter by agent (`claude` or `codex`) |
| `-c, --command <cmd>` | Run a single command instead of interactive shell |
| `--as-agent` | Exec as the `agent` user (UID 1000) instead of root (default) |

### `containme build`

| Flag | Description |
|------|-------------|
| `-a, --agent <agent>` | Build only one agent image (`claude` or `codex`) |

### `containme reset <target>`

| Target | Claude | Codex |
|--------|--------|-------|
| `auth` | Deletes `.credentials.json` | Deletes `auth.json` |
| `mcp` | Removes `mcpServers` from `.claude.json` | Not applicable (prints message) |
| `cache` | Removes `cache/`, `statsig/`, `telemetry/`, `debug/`, `paste-cache/`, `downloads/`, `stats-cache.json` | Removes `log/` |

## Project config file

Add a `containme.yml` to your project to set defaults:

```yaml
agent: claude
trust: bind
network: full
```

CLI flags always override the config file.

## Trust levels

| Level | What the agent can access | Status |
|-------|--------------------------|--------|
| `bind` | Live read-write mount of your project | Available (default) |
| `snapshot` | Copy of your project at session start | Not yet implemented |
| `git` | Isolated git branch | Not yet implemented |

Only `bind` is currently functional. Using `--trust snapshot` or `--trust git` will error at startup.

## Installing packages that persist across restarts

Containers are ephemeral — packages installed with `apt-get` at runtime are lost when the container restarts. Use `containme-install` instead:

```bash
containme-install pandoc libreoffice-writer-nogui
```

This installs the packages immediately and records them in a persistent list on the `user-npm` volume. On future container starts, any recorded packages not already in the image are automatically reinstalled.

The pre-installed tools (pandoc, LibreOffice, Playwright, etc.) are baked into the Docker image and don't need `containme-install`. This mechanism is for additional packages the agent discovers it needs at runtime.

You can also pre-specify packages via environment variable without persisting them:

```bash
containme run -e CONTAINME_APT_PACKAGES="imagemagick texlive-base" .
```

## Installing MCP servers

The `@neuledge/context` MCP server is pre-configured and auto-installed on first session start. For additional MCP servers, install as the **agent user** so they land in the persistent `user-npm` volume — running as root writes to `/root/` which is ephemeral.

```bash
containme bash --as-agent
npm install -g <package>
claude mcp add <name> -- <command>
```

The `user-npm` volume persists across sessions, so installed packages survive container restarts.

## Persistent data

Agent data lives in named Docker volumes that are **never deleted by containme**:

| Volume | Mount | Contains |
|--------|-------|----------|
| `claude-data` | `~/.claude` | Credentials, settings, conversation history, memory, MCP config |
| `user-npm` | `~/.npm-global` | User-installed npm packages (MCP servers, etc.) — shared by Claude and Codex |
| `codex-data` | `~/.codex` | Auth, config, history |
| `npm-cache` | `~/.npm` | npm package cache (shared, speeds up installs) |
| `pip-cache` | `~/.cache/pip` | pip package cache |
| `cargo-cache` | `~/.cargo/registry` | Cargo package cache |

The cache volumes (`npm-cache`, `pip-cache`, `cargo-cache`) are shared across sessions by default. Use `--isolated-caches` to give each session its own fresh caches.

## Built-in capabilities

### Pre-installed tools (all containers)
- **Pandoc** — universal document converter (Markdown → DOCX, HTML, PDF, etc.)
- **LibreOffice (headless)** — document rendering and format conversion (Writer, Calc, Impress — nogui variants for headless use). Useful for DOCX → PDF conversion and visual layout verification (`libreoffice --headless --convert-to pdf document.docx`)
- **Playwright + Chromium** — browser automation (pre-installed, no-sandbox config for Docker)

### Claude container
- **SearXNG MCP** — web search via a SearXNG instance you run on the host at port 8086 (configure with `containme run -e SEARXNG_URL=http://host.docker.internal:<port>` if using a different port)
- **Playwright MCP** — browser control via MCP
- **context MCP** — up-to-date library documentation via [neuledge/context](https://github.com/neuledge/context), auto-installed on first start
- **get-shit-done** — local-first fork of [get-shit-done](https://github.com/pedropachecog/get-shit-done) that replaces Anthropic API-dependent websearch/webfetch with [SearXNG](https://github.com/searxng/searxng) and [context](https://github.com/neuledge/context); auto-installed on first start
- **find-skills** — skill discovery

### Codex container
- **context MCP** — same as Claude, registered via `~/.codex/config.toml` on first start
- **superpowers** — agent skill framework
- **find-skills** — skill discovery

## Architecture

```
containme run .
    │
    ├── builds containme-base (Ubuntu 24.04 + Node + dev tools)
    ├── builds agent image (extends base + installs agent CLI)
    └── docker compose run
            ├── compose/docker-compose.yml        (base: volumes, limits, host networking)
            ├── compose/docker-compose.claude.yml (claude agent overlay)
            ├── compose/docker-compose.bind.yml   (trust level overlay)
            └── .containme/docker-compose.override.<session>.yml  (session: env, mounts)
```

Secrets (API keys) go to `$TMPDIR/containme-secrets-<session>.env` at mode `0600` — never in the project directory.

## Security

- Agent runs as non-root user (`agent`, UID 1000)
- Capabilities dropped to minimum (`CHOWN`, `SETUID`, `SETGID`, `DAC_OVERRIDE`)
- `sudo` restricted to `apt` and `apt-get` only
- API keys written to OS tmpdir with `0600` permissions, never in compose files
- Bind mounts to `/`, `/etc`, `/proc`, `/sys`, `/run`, `/dev` are rejected
- Package name validation rejects shell metacharacters
- Session IDs are 128-bit random

## Development

```bash
containme build     # compile TypeScript + rebuild Docker images
npm run build       # compile TypeScript only → dist/
npm test            # run test suite (vitest)
npm run test:watch  # watch mode
```

## File layout

```
src/
  index.ts                    CLI entry point (Commander.js)
  commands/
    run.ts                    containme run — builds images, spawns docker compose
    run-local.ts              containme run-local — local model config + run
    reset.ts                  containme reset — targeted config resets
    build.ts                  containme build — compile TypeScript + rebuild Docker images
    bash.ts                   containme bash — open shell in a running container
  core/
    compose-generator.ts      generates session override YAML
    credential-resolver.ts    discovers API keys + git identity
    path-resolver.ts          Windows path → Docker path translation
    global-config.ts          ~/.containme/config.yml read/write
  agents/
    claude-code.ts            Claude agent config
    codex.ts                  Codex agent config
  utils/
    platform.ts               OS detection helpers
    package-root.ts           resolves containme install directory
docker/
  base.Dockerfile             Ubuntu 24.04 + Node + Playwright + Pandoc + LibreOffice + dev tools
  claude.Dockerfile           extends base + Claude Code CLI + skills
  codex.Dockerfile            extends base + Codex CLI
  scripts/entrypoint.sh       container startup (MCP registration, secrets, git config, package restore)
  scripts/containme-install   install apt packages and persist them across restarts
compose/
  docker-compose.yml          base service definition
  docker-compose.claude.yml   Claude agent overlay (claude-data volume)
  docker-compose.codex.yml    Codex agent overlay (codex-data volume)
  docker-compose.bind.yml     bind trust level overlay
```

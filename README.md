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
npm run build
```

Then use `node dist/index.js` or add an alias:

```bash
alias containme="node /path/to/containme/dist/index.js"
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

## Persistent data

Agent data lives in named Docker volumes that are **never deleted by containme**:

| Agent | Volume | Contains |
|-------|--------|----------|
| Claude Code | `claude-data` | Credentials, settings, conversation history, memory, MCP config |
| Codex | `codex-data` | Auth, config, history |

### Migrating from an older claude-config volume

If you used containme before the `claude-data` rename:

```bash
docker volume create claude-data
docker run --rm -v claude-config:/src -v claude-data:/dst alpine sh -c 'cp -a /src/. /dst/'
```

## Built-in capabilities (Claude container)

- **Playwright + Chromium** — browser automation (pre-installed, no-sandbox config for Docker)
- **SearXNG MCP** — web search via local SearXNG instance at `host.docker.internal:8086`
- **Playwright MCP** — browser control via MCP
- **Skills + Superpowers** — pre-installed agent skill frameworks

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
npm run build       # compile TypeScript → dist/
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
docker/
  base.Dockerfile             Ubuntu 24.04 + Node + Playwright + dev tools
  claude.Dockerfile           extends base + Claude Code CLI + skills
  codex.Dockerfile            extends base + Codex CLI
  scripts/entrypoint.sh       container startup (MCP registration, secrets, git config)
compose/
  docker-compose.yml          base service definition
  docker-compose.claude.yml   Claude agent overlay (claude-data volume)
  docker-compose.codex.yml    Codex agent overlay (codex-data volume)
  docker-compose.bind.yml     bind trust level overlay
```

# Persistent Agent Data + Reset Commands

## Problem

The `claude-config` Docker volume holds all of `~/.claude/` — auth credentials, MCP settings, conversation history, memory, plans, tasks, and settings. When the volume is deleted (e.g., to fix auth issues), all user data is lost. This happened in practice and destroyed conversation history.

## Design

### Single permanent volume per agent

Each agent gets one named Docker volume that holds all agent state. This volume is permanent — no containme command ever deletes it.

**Claude:**
- Volume name: `claude-data` (renamed from `claude-config`)
- Mount path: `/home/agent/.claude/`
- Contains: credentials, config, settings, MCP, conversations, memory, plans, tasks, file-history, research output

**Codex:**
- Volume name: `codex-data` (new, replaces implicit `.codex/` storage)
- Mount path: `/home/agent/.codex/`
- Contains: auth.json, config.toml, history, logs, SQLite state

### Targeted reset commands

Instead of volume deletion, provide surgical reset operations via a new `containme reset` subcommand.

#### `containme reset auth`

Deletes agent auth credentials only. The agent will need to re-authenticate on next run.

- Claude: deletes `.credentials.json` only (NOT `config.json` — that may contain non-auth settings)
- Codex: deletes `auth.json`

#### `containme reset mcp`

Removes MCP server registrations so the entrypoint re-registers them cleanly on next startup.

- Claude: deletes the `mcpServers` key from the `.claude.json` config file via JSON manipulation (no agent CLI needed)
- Codex: not applicable — Codex does not use MCP servers. Running `containme reset mcp --agent codex` prints a message: "Codex does not use MCP servers" and exits cleanly.

#### `containme reset cache`

Clears transient/cache directories only. Safe to run anytime.

- Claude: removes `cache/`, `statsig/`, `telemetry/`, `debug/`, `paste-cache/`, `downloads/`, `stats-cache.json`
- Codex: removes `log/`

### File changes

#### `compose/docker-compose.claude.yml`
- Rename volume `claude-config` → `claude-data`

#### `compose/docker-compose.codex.yml`
- Add `codex-data` volume at `/home/agent/.codex/`
- Add `CODEX_HOME=/home/agent/.codex` env var

#### `docker/codex.Dockerfile`
- `RUN mkdir -p /home/agent/.codex` already exists — no change needed
- Add `ENV CODEX_HOME="/home/agent/.codex"`

#### `src/commands/reset.ts` (new)
- Implements `containme reset <target>` with subcommands: `auth`, `mcp`, `cache`
- Accepts `--agent <claude|codex>` flag (defaults to claude)
- Uses `docker run --rm` with the full agent image (e.g., `containme-base`) and the data volume mounted, so all necessary tools are available
- All operations are file deletions or JSON edits — no agent CLI commands required at reset time
- Prints what was deleted so the user knows what happened

#### `src/index.ts`
- Register `containme reset` command with subcommands

#### Tests
- Unit tests for reset command argument validation
- Integration test: verify `claude-data` volume name in compose file
- Integration test: verify `codex-data` volume name in compose file

### What this does NOT do

- No volume is ever deleted by any containme command
- No `docker volume rm` is ever suggested in error messages or docs
- No `docker system prune` is ever suggested
- The user manages their own data deletion manually if they choose to

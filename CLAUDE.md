# Containme

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
node dist/index.js run --api-url http://host.docker.internal:8080/v1  # Local model
```

## Code Conventions

- ESM imports with `.js` extensions (e.g., `import from './foo.js'`)
- Interfaces exported from the module that defines them (e.g., `AgentConfig` from `claude-code.ts`)
- Compose files in `compose/` follow naming: `docker-compose.{purpose}.yml`
- Dockerfiles in `docker/` follow naming: `{purpose}.Dockerfile`
- Non-root "agent" user (UID 1000) inside containers
- API keys via env vars at runtime, never in images

## Related Projects

- **anthropic-image-proxy** (`D:\Pedro\Repos\exper\anthropic-image-proxy`): Standalone Node.js proxy that fixes Claude Code image reading with non-Anthropic providers (llama-server, vLLM, etc.). Promotes images from `tool_result` content to user message level. Run alongside containme when using local models: `npx anthropic-image-proxy --target http://192.168.1.190:8001`, then set `ANTHROPIC_BASE_URL=http://localhost:3456` when starting the agent.

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

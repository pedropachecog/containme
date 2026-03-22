# Containme: Safely Run AI Coding Agents in Docker Containers

## Context

AI coding agents (Claude Code, OpenAI Codex) require broad system permissions to be productive, but granting those permissions on a real machine is dangerous — the user lost 3 years of WSL work when Codex ran with `--dangerously-skip-permissions`. Without that flag, agents ask permission on every action, destroying productivity.

**Containme** solves this by running agents inside disposable Docker containers where "full permissions" can't damage anything real. Its key differentiator over existing tools (Docker's native `docker sandbox`, claude-code-sandbox, etc.) is a **configurable trust level system** that lets users choose how changes flow back to the host — from fully isolated snapshots to live bind mounts.

Docker's native sandbox was evaluated but rejected as the sole runtime because: 4GB RAM hard cap, no DevContainer support, CLI-only (no API), experimental Windows support, and no configurable trust levels for workspace protection.

**Local model support**: Agents must also work with local LLM backends (e.g., llama-server running on the host). The container needs network access to the host's model server, and agent configuration must support custom API endpoints.

## Architecture

**Docker Compose + TypeScript CLI hybrid.**

- **Docker Compose** handles container orchestration: service definitions, volumes, networking, env injection
- **TypeScript CLI** (`containme`, distributed via npm) handles: config parsing, credential discovery, Windows path resolution, trust level selection, compose overlay generation, session lifecycle
- **DevContainer configs** reference the same compose files for VS Code/Cursor integration

## Trust Levels (Core Feature)

Three output flow modes, selectable per session via `--trust`:

### Snapshot (`--trust snapshot`) — Default, maximum safety
- Project files copied into container at session start via `docker cp`
- Host project is never mounted — container cannot read/write host
- When done: `containme diff` shows changes, `containme approve` selectively copies approved files back
- Approve flow: interactive CLI diff viewer by default, `--patch` flag to output a `.patch` file

### Git Sync (`--trust git`) — Balanced
- Container clones the repo and works on a session branch (`containme/session-<id>`)
- Changes pushed to that branch automatically
- Host pulls/merges/cherry-picks at will

### Bind Mount (`--trust bind`) — Maximum productivity
- Host project directory bind-mounted read-write into container
- Changes appear immediately on both sides
- Container still can't touch anything outside the mounted path

## Container Image Layers

```
Agent Layer (claude.Dockerfile / codex.Dockerfile)
  - Agent CLI installed globally
  - Agent-specific flags (--dangerously-skip-permissions)
  - Agent state directory setup

Base Layer (base.Dockerfile, FROM ubuntu:24.04)
  - git, gh, curl, wget, ripgrep, fd-find, jq
  - Node.js 22 LTS + npm + pnpm + yarn
  - Python 3.12 + pip + uv
  - Build essentials (gcc, g++, make, cmake)
  - SSH client, CA certificates
  - Non-root "agent" user (UID 1000)
```

## Volume Strategy

| Data | Mount | Lifecycle |
|------|-------|-----------|
| Project source | Per trust level | Session |
| Package caches (npm, pip, cargo) | Named volumes | Persistent |
| Agent state (.claude/, .codex/) | Named volumes | Persistent |
| Temp/scratch | tmpfs | Ephemeral |
| Git/SSH credentials | Read-only bind | Session |

## Local Model Support (llama-server)

Agents can connect to local LLM servers (llama-server, ollama, vLLM, etc.) running on the host instead of cloud APIs. This is handled via:

**Networking**: The compose base file adds `extra_hosts: ["host.docker.internal:host-gateway"]` so the container can reach host services. On Docker Desktop for Windows this is automatic, but the explicit mapping ensures it works on Linux Docker too.

**Endpoint configuration**: The CLI accepts `--api-url` to set the model server endpoint. This is passed to the agent as an environment variable:
- Claude Code: `ANTHROPIC_BASE_URL=http://host.docker.internal:8080/v1` (or the appropriate env var for custom endpoints)
- Codex: `OPENAI_BASE_URL=http://host.docker.internal:8080/v1`

**In `containme.yml`**:
```yaml
agents:
  claude:
    api_url: "http://host.docker.internal:8080/v1"  # llama-server on host
    # api_key not required for local models (or set a dummy)
```

**Auto-detection**: The credential resolver checks if an API key is available. If not, it prompts: "No ANTHROPIC_API_KEY found. Are you using a local model server?" and asks for the endpoint URL.

**Network mode interaction**: When using `--network none` (offline), the container can still reach `host.docker.internal` since it's a host-gateway route, not internet traffic. This is the ideal setup for local models — no internet access but full access to the host's model server.

## Security Model

- API keys via env vars at runtime (never in images)
- No Docker socket mounted (no container escape)
- No host dirs mounted except target project
- Non-root user inside container
- Resource limits: 8GB RAM, 4 CPUs, 20GB storage (configurable)
- PID limit against fork bombs
- Network: full outbound by default, configurable limited/offline modes
- Host gateway access for local model servers (configurable, can be disabled)

## CLI Commands

```
containme run [options] [-- <agent-args>]   # Start sandboxed agent session
  --agent, -a    "claude" | "codex"         # Default: claude
  --trust, -t    "snapshot" | "git" | "bind" # Default: snapshot
  --persist, -p  Keep container after exit   # Default: false
  --network      "full" | "limited" | "none" # Default: full
  --api-url      Custom API endpoint         # For local models (llama-server, ollama)
  --prompt       Initial task for agent      # Optional
  --env, -e      Extra env vars (KEY=VALUE)  # Repeatable
  --mount, -m    Extra mounts (src:dst:opts) # Repeatable

containme diff <session>                    # Show agent changes
containme approve <session> [--patch]       # Accept changes to host
containme ls                                # List sessions
containme stop <session>                    # Stop session
containme attach <session>                  # Reconnect to session
containme init                              # Create containme.yml
containme clean [--caches]                  # Cleanup
```

## Configuration File: `containme.yml`

Placed in project root. Defines defaults for agent, trust level, network mode, resource limits, extra packages to install, and agent-specific settings. CLI flags override config file values.

## Project Structure

```
containme/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # CLI entry (commander)
│   ├── commands/
│   │   ├── run.ts                  # Primary command
│   │   ├── diff.ts                 # Show changes
│   │   ├── approve.ts              # Accept changes
│   │   ├── list.ts                 # List sessions
│   │   ├── stop.ts                 # Stop session
│   │   ├── attach.ts               # Reconnect
│   │   ├── init.ts                 # Scaffold config
│   │   └── clean.ts                # Cleanup
│   ├── core/
│   │   ├── config.ts               # containme.yml parsing
│   │   ├── compose-generator.ts    # Dynamic override generation
│   │   ├── credential-resolver.ts  # API key discovery
│   │   ├── path-resolver.ts        # Windows/WSL path translation
│   │   ├── session-manager.ts      # Track containers
│   │   ├── output-sync.ts          # Sync logic per trust level
│   │   └── trust-levels.ts         # Trust level definitions
│   ├── agents/
│   │   ├── claude-code.ts          # Claude-specific config
│   │   └── codex.ts                # Codex-specific config
│   └── utils/
│       ├── docker.ts               # Docker/Compose invocation
│       ├── git.ts                  # Git operations
│       └── platform.ts             # OS detection
├── docker/
│   ├── base.Dockerfile
│   ├── claude.Dockerfile
│   ├── codex.Dockerfile
│   └── scripts/
│       ├── entrypoint.sh
│       └── setup-agent.sh
├── compose/
│   ├── docker-compose.yml          # Base service definition
│   ├── docker-compose.claude.yml   # Claude overlay
│   ├── docker-compose.codex.yml    # Codex overlay
│   ├── docker-compose.bind.yml     # Bind mount overlay
│   ├── docker-compose.git.yml      # Git sync overlay
│   ├── docker-compose.snapshot.yml # Snapshot overlay
│   └── docker-compose.persist.yml  # Long-lived container overlay
├── devcontainer/
│   ├── claude/devcontainer.json
│   └── codex/devcontainer.json
├── templates/
│   ├── containme.yml               # Config template
│   └── .env.example
└── test/
    ├── unit/
    └── integration/
```

## How the Three Interfaces Relate

1. **CLI** (`containme run`): Reads `containme.yml`, resolves creds/paths, selects compose overlays, generates temporary override, invokes `docker compose up`
2. **Docker Compose** (direct): Power users can invoke compose files directly with manual env var setup
3. **DevContainer**: References compose files for VS Code "Reopen in Container" — hardcoded to bind-mount trust level

## Windows Considerations

- `path-resolver.ts` translates `D:\foo\bar` to `/d/foo/bar` for Docker Desktop
- Base image sets `git config core.autocrlf input` to prevent CRLF issues
- WSL2 backend recommended for best bind-mount performance
- SSH agent forwarding handles Windows named pipes vs. Unix sockets

## Implementation Phases

### Phase 1: MVP — `containme run` with Claude + bind mount [COMPLETE]
1. ~~Create `package.json` with commander, TypeScript setup~~
2. ~~Build `docker/base.Dockerfile` (ubuntu:24.04 + dev tools)~~
3. ~~Build `docker/claude.Dockerfile` (extends base + Claude Code CLI)~~
4. ~~Create `compose/docker-compose.yml` (base, includes `extra_hosts: host.docker.internal:host-gateway`) + `compose/docker-compose.claude.yml` + `compose/docker-compose.bind.yml`~~
5. ~~Implement `src/core/path-resolver.ts` (Windows path translation)~~
6. ~~Implement `src/core/credential-resolver.ts` (find API keys OR detect local model endpoint via --api-url)~~
7. ~~Implement `src/commands/run.ts` (invoke compose with correct overlays, pass API URL if local model)~~
8. ~~Implement `src/index.ts` (CLI entry point)~~
9. Test: `containme run` starts Claude Code in container on current repo (cloud API)
10. Test: `containme run --api-url http://host.docker.internal:8080/v1` works with local llama-server

### Phase 2: Trust Levels [NEXT]
11. Implement `src/core/trust-levels.ts` (snapshot/git/bind abstractions)
12. Create `compose/docker-compose.snapshot.yml` + `compose/docker-compose.git.yml`
13. Implement `docker/scripts/entrypoint.sh` (handles workspace init per mode) — already created, may need updates
14. Implement `src/core/output-sync.ts` (docker cp for snapshot, git clone/push for git)
15. Implement `src/commands/diff.ts` (interactive file-by-file diff + --patch flag)
16. Implement `src/commands/approve.ts` (selective copy-back for snapshot mode)
17. Test: all three trust levels work end-to-end

### Phase 3: Codex + Session Management
18. Build `docker/codex.Dockerfile`
19. Create `compose/docker-compose.codex.yml`
20. Implement `src/agents/codex.ts` — already created
21. Implement `src/commands/list.ts`, `stop.ts`, `attach.ts`
22. Implement `src/core/session-manager.ts`
23. Test: both agents, session lifecycle

### Phase 4: Config + DevContainers + Polish
24. Implement `src/core/config.ts` (containme.yml parsing + validation)
25. Implement `src/commands/init.ts` (scaffold containme.yml)
26. Create `devcontainer/claude/devcontainer.json` + `devcontainer/codex/devcontainer.json`
27. Implement network isolation modes (limited with proxy sidecar, offline)
28. Implement `src/commands/clean.ts`
29. Create `compose/docker-compose.persist.yml` for long-lived containers
30. Write tests (unit + integration)

## Verification

### Phase 1 verification:
```bash
npm run build
containme run                    # Should start Claude Code in bind-mount container
# Inside container: verify git, node, python available
# Inside container: verify ANTHROPIC_API_KEY is set
# Create a file, verify it appears on host

# Local model test:
# Start llama-server on host (e.g., port 8080)
containme run --api-url http://host.docker.internal:8080/v1
# Inside container: verify ANTHROPIC_BASE_URL points to host
# Inside container: verify agent can reach the model server
```

### Phase 2 verification:
```bash
containme run -t snapshot        # Files copied in, no host mount
# Agent makes changes inside container
containme diff <session>         # Should show file diffs
containme approve <session>      # Should copy approved files back

containme run -t git             # Should clone repo, create session branch
# Agent commits changes
# On host: git branch shows containme/session-xxx
```

### Phase 3 verification:
```bash
containme run -a codex -t bind   # Codex in bind mount
containme ls                     # Lists running sessions
containme stop <session>         # Stops it
```

### Phase 4 verification:
```bash
containme init                   # Creates containme.yml
# Edit containme.yml, run again — settings applied
# Open in VS Code, "Reopen in Container" — devcontainer works
```

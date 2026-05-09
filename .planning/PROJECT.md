# Containme

## What This Is

A CLI toolkit for safely running AI coding agents (Claude Code, OpenAI Codex) inside disposable Docker containers with configurable trust levels. Solo developers point it at a project, pick how much access the agent gets to host files (`bind` for live edits, `git` for branch sync, `snapshot` for full isolation + diff/approve), and run agents with `--dangerously-skip-permissions` without risking real systems.

## Core Value

A solo developer can let an AI agent loose on a real project and trust that, in the worst case, the host machine and source tree are untouched.

## Requirements

### Validated

<!-- Shipped in current codebase. Confirmed working. -->

- ✓ **CLI scaffolding** — `containme run | run-local | reset | build | bash` via commander — existing
- ✓ **Base + claude + codex Docker images** — Ubuntu 24.04 + Node 22 + Python + dev tools — existing
- ✓ **Bind trust level** — live RW bind mount of project — existing
- ✓ **Compose overlay stacking** — base + agent + trust + per-session override — existing
- ✓ **Path resolution (Windows)** — `D:\foo` → `/d/foo` for Docker Desktop — existing
- ✓ **Credential resolution** — API key, git identity, GitHub token, host `.claude.json` bootstrap — existing
- ✓ **Per-session secrets file** — 0600 in `os.tmpdir()`, never in compose YAML — existing
- ✓ **Reset command** — targeted `auth/mcp/cache` reset without destroying volumes — existing
- ✓ **Local-model entrypoint config** — `--api-url` flag, `host.docker.internal` wiring, `run-local` defaults persistence — existing
- ✓ **Bash attach flow** — `containme bash` lists/attaches to running session containers — existing
- ✓ **Container hardening** — non-root agent user (UID 1000), `cap_drop: ALL`, resource limits, package-name shell-injection guard, mount denylist — existing

### Active

<!-- v1 scope. Building toward these. -->

- [ ] **Snapshot trust level** — `docker cp` flow, host project never mounted; replaces today's "snapshot is in `VALID_TRUSTS` but compose file missing" silent failure
- [ ] **`containme diff`** — interactive CLI diff viewer for snapshot sessions; `--patch` flag for `.patch` output
- [ ] **`containme approve`** — selectively copies approved files from snapshot back to host
- [ ] **Git trust level** — per-session branch (`containme/session-<id>`); entrypoint hook already partial, missing the compose overlay
- [ ] **`containme init`** — copies `templates/containme.yml` into project; first-run UX
- [ ] **`containme ls`** — list running containme sessions across projects
- [ ] **`containme stop`** — stop a running session by id/agent/project
- [ ] **`containme attach`** — explicit attach (today only via `bash`)
- [ ] **`containme clean`** — safe disk hygiene: orphan secrets files, `--isolated-caches` orphan volumes, stale per-session override files. Never deletes named persistent volumes.
- [ ] **Local-model story polished** — `anthropic-image-proxy` bundled or first-class via `run-local`; image-read works end-to-end against llama-server; documented setup
- [ ] **Fix dead code / silent degradations** — `CONTAINME_AGENT` env var actually set in compose; `--network limited` either implemented or rejected; `dist/` not shipped; consolidate double-cleanup; bash basename-only filter; `containme.yml` schema validation
- [ ] **Test coverage for `run.ts` orchestration** — currently 0% direct coverage; cover signal handling, cleanup ordering, compose stacking, snapshot/git trust failure paths
- [ ] **A good README** — public-OSS quality: install, quickstart for each trust level, local-model walkthrough, troubleshooting, comparison vs alternatives
- [ ] **npm publish workflow** — `containme` package live on npm; GitHub release flow; semver discipline

### Out of Scope

<!-- Explicit boundaries. -->

- **Switch default trust to `snapshot` once it ships** — left as `bind` for v1; user opts into snapshot explicitly. Revisit post-1.0.
- **CLI flags for resource limits (`--mem-limit`, `--cpus`, `--pids-limit`, `--shm-size`)** — current 8GB / 4 CPU / 4096 PID / 2GB shm hardcoded values are fine for solo-dev v1; add when a real user asks
- **Team / multi-user / CI usage** — solo-dev only for v1; no per-user volume isolation, no shared image registry, no CI mode
- **Remote Docker contexts** — single-host local Docker only
- **Additional agents beyond Claude Code & Codex** — agent registry pattern supports it, but no Aider/Cline/etc. in v1
- **Config schema migration tooling** — `containme.yml` is small enough that breaking changes get a release note
- **Sandboxed `safe.directory` scoping** — global `safe.directory '*'` accepted for v1; container is single-purpose

## Context

- **Origin story:** User lost ~3 years of WSL work to Codex running with `--dangerously-skip-permissions`. Containme exists so that flag becomes safe again.
- **Prior art evaluated and rejected:** Docker's native `docker sandbox` (4GB RAM cap, no DevContainer support, CLI-only, experimental on Windows, no trust levels), `claude-code-sandbox` (no trust-level differentiation).
- **Codebase already mapped** — see `.planning/codebase/` (ARCHITECTURE, STACK, CONCERNS, CONVENTIONS, INTEGRATIONS, STRUCTURE, TESTING) refreshed 2026-05-09. Seven files capture current state and known gaps.
- **Companion project:** `anthropic-image-proxy` (separate repo) fixes Claude Code image reads against non-Anthropic providers (llama.cpp drops images from `tool_result`). Local-model story depends on it.
- **Phase 1 already complete** — CLI scaffolding, base + claude images, run command, path/credential resolvers, bind mount. See `plan.md` for the original 4-phase plan.
- **Cross-platform target:** Windows (Docker Desktop), WSL, Linux. macOS not actively tested but no known blockers.

## Constraints

- **Tech stack**: TypeScript ESM (Node16) + Commander.js + Docker Compose v2 — chosen; no rewrite considered for v1
- **Container runtime**: Docker Compose (not Docker microVMs) — explicitly chosen for sufficient isolation + no 4GB cap + DevContainer compatibility
- **Volume safety (ABSOLUTE)**: Never delete `claude-data`, `codex-data`, `user-npm` volumes. Contains irreplaceable conversation history, memory, settings. Targeted `containme reset` only. (See repo `CLAUDE.md` ABSOLUTE RULES.)
- **Secrets**: API keys via env file (0600 in `os.tmpdir()`), never in images, never in compose YAML, never in argv
- **Shell-injection guard**: `CONTAINME_*_PACKAGES` env vars must remain allowlist-validated (`[a-zA-Z0-9_.+ -]` only)
- **Backwards compatibility**: Pre-1.0 — breaking CLI changes allowed with a clear release note
- **GSD install asymmetry locked-in**: Claude container clones `pedropachecog/get-shit-done` fork; Codex uses official `get-shit-done-cc@latest`. Do NOT swap Codex to the fork — explicit user instruction (memory: `feedback_codex_gsd_official_npm.md`).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Audience = solo devs (not teams) | Keeps v1 scope tight; team features have a long tail that would block 1.0 | — Pending |
| `bind` stays default trust for v1 | Productivity-first default; users opt into snapshot when they want safety | — Pending |
| Dead-code & silent-degradation cleanup is in-scope | Public OSS audience can't tolerate "feature accepted but silently broken" (snapshot, --network limited, etc.) | — Pending |
| Resource-limit CLI flags deferred | Hardcoded limits (8GB/4CPU) are fine for solo-dev v1; add when needed | — Pending |
| Companion `anthropic-image-proxy` stays a separate package | Single-responsibility; containme integrates it via docs + `run-local` defaults rather than vendoring | — Pending |
| npm publish under `containme` | Distribution to public OSS audience requires `npx containme` to work | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-09 after initialization*

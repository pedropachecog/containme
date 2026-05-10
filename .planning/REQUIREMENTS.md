# Requirements: Containme

**Defined:** 2026-05-09
**Core Value:** A solo developer can let an AI agent loose on a real project and trust that, in the worst case, the host machine and source tree are untouched.

## v1 Requirements

Requirements for v1.0 release. Each maps to a roadmap phase.

### Trust Levels

- [ ] **TRUST-01**: User can run a session with `--trust snapshot`; project files are copied into the container via `docker cp` at session start (host project is never bind-mounted)
- [ ] **TRUST-02**: User can run `containme diff` against a snapshot session and see an interactive CLI diff of changes the agent made
- [ ] **TRUST-03**: User can run `containme diff --patch` to write changes to a `.patch` file instead of the interactive viewer
- [ ] **TRUST-04**: User can run `containme approve` to selectively copy approved files from a snapshot session back to the host project
- [ ] **TRUST-05**: User can run a session with `--trust git`; the container clones the repo and works on a session branch named `containme/session-<id>`
- [ ] **TRUST-06**: Git-trust changes are pushed to the session branch automatically; host can pull / merge / cherry-pick at will
- [ ] **TRUST-07**: When a user passes `--trust snapshot` or `--trust git`, the corresponding compose file exists and the run succeeds (no more "compose file not found" silent failure)

### Session Commands

- [ ] **CMD-01**: User can run `containme init` to copy `templates/containme.yml` into the current project directory
- [ ] **CMD-02**: User can run `containme ls` to list all running containme sessions across projects (shows id, agent, trust, project)
- [ ] **CMD-03**: User can run `containme stop <session>` to stop a session by id, agent, or project
- [ ] **CMD-04**: User can run `containme attach <session>` to attach to a running session's TTY (today only via `bash`)
- [ ] **CMD-05**: User can run `containme clean` to safely reclaim disk: removes orphan secrets files in `os.tmpdir()`, orphan `--isolated-caches` volumes, stale per-session override files. Never removes `claude-data` / `codex-data` / `user-npm`.

### Local Models

- [ ] **LOCAL-01**: `containme run-local` is a documented, working path for pointing an agent at a local llama-server / vLLM / ollama endpoint
- [ ] **LOCAL-02**: README documents how to run `anthropic-image-proxy` alongside containme so Claude Code's image-read tool works against non-Anthropic providers
- [ ] **LOCAL-03**: First-run UX: if no API key and no `--api-url`, prompt the user once and persist their choice to `~/.containme/config.yml`

### Code Quality (in-scope concerns)

- [ ] **QUAL-01**: `CONTAINME_AGENT` env var is actually set in `compose/docker-compose.{claude,codex}.yml` so entrypoint's npm-install fallbacks engage on first-run users
- [ ] **QUAL-02**: `--network limited` is either implemented (custom bridge with egress policy) or rejected with a clear error — no more silent fallback to full network
- [ ] **QUAL-03**: `dist/` is gitignored and not shipped in the repo (verify and fix)
- [ ] **QUAL-04**: Double-cleanup pattern in `run.ts` (signal handler + `finally` block) is consolidated
- [ ] **QUAL-05**: `containme bash` no longer falls back to basename-only container matching; full-path equality only
- [ ] **QUAL-06**: `containme.yml` parsing validates against an explicit schema (zod or valibot) and warns on unknown keys
- [ ] **QUAL-07**: `getPackageRoot()` walks up only until finding `package.json` whose `name === "containme"` (correct behavior under transitive installs)

### Tests

- [ ] **TEST-01**: `src/commands/run.ts` orchestration covered by tests: signal handling (SIGINT/SIGTERM), cleanup ordering, compose stacking, error paths
- [ ] **TEST-02**: `--trust snapshot` and `--trust git` happy-path and failure-path tests (would have caught today's compose-file-not-found gap)
- [ ] **TEST-03**: Schema validation (QUAL-06) covered by tests including the unknown-key warning

### Documentation

- [ ] **DOCS-01**: README has a public-OSS-quality install + quickstart for each trust level (`bind`, `git`, `snapshot`)
- [ ] **DOCS-02**: README has a local-model walkthrough including `anthropic-image-proxy` setup
- [ ] **DOCS-03**: README has a troubleshooting section (common Docker Desktop / WSL / Windows-path errors, volume reset commands)
- [ ] **DOCS-04**: README has a comparison vs `docker sandbox` and `claude-code-sandbox` so users understand when to pick containme

### Distribution

- [ ] **DIST-01**: `containme` package published to npm at v1.0.0; `npx containme run .` works on a clean machine
- [ ] **DIST-02**: GitHub release is cut for v1.0.0 with release notes
- [ ] **DIST-03**: Pre-publish CI: build, test, dry-run npm pack to verify shipped bundle excludes `dist/` source maps and `.planning/`

## v2 Requirements

Deferred to a future release.

### Defaults & Polish

- **DEF-01**: Switch default trust level from `bind` to `snapshot` once snapshot is battle-tested
- **DEF-02**: CLI flags for resource limits (`--mem-limit`, `--cpus`, `--pids-limit`, `--shm-size`)

### Multi-Session

- **MULT-01**: Per-session named volumes for `user-npm` to avoid concurrent-install races
- **MULT-02**: Resource flag overrides via CLI

### Hardening

- **HARD-01**: Scope `safe.directory` to `/workspace` and explicit GSD worktree paths (not `*`)
- **HARD-02**: Startup sweep deletes orphan `containme-secrets-*.env` files older than N hours
- **HARD-03**: First-run prompt to confirm contents of an unfamiliar `containme.yml` before applying it

### Agents

- **AGT-01**: Add support for additional agents (Aider, Cline, Cursor CLI) via the existing `AgentConfig` registry

## Out of Scope

| Feature | Reason |
|---------|--------|
| Team / multi-user / CI mode | Solo-dev only for v1; team features are a long tail |
| Remote Docker contexts | Single-host local Docker only |
| Switch default trust to `snapshot` in v1 | Productivity-first default; opt into snapshot. Revisit post-1.0. |
| Resource-limit CLI flags in v1 | Hardcoded 8GB/4CPU/4096-PID/2GB-shm fine for solo-dev v1 |
| Vendor `anthropic-image-proxy` into containme | Single-responsibility; integrate via docs + run-local defaults |
| Pin agent CLI versions in image | Latest-by-default acceptable for v1; track if a breaking release lands |
| Swap Codex's GSD install to `pedropachecog` fork | Explicit user instruction (memory: feedback_codex_gsd_official_npm.md) — Codex MUST use official npm |
| Config schema migration tooling | `containme.yml` small enough that breaking changes get a release note |
| macOS active testing | No known blockers but not in v1 test matrix |

## Traceability

Empty until roadmap creation. Will be populated by Step 8.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRUST-01 | Phase 1 | Pending |
| TRUST-02 | Phase 1 | Pending |
| TRUST-03 | Phase 1 | Pending |
| TRUST-04 | Phase 1 | Pending |
| TRUST-05 | Phase 2 | Pending |
| TRUST-06 | Phase 2 | Pending |
| TRUST-07 | Phase 1 | Pending |
| CMD-01 | Phase 2 | Pending |
| CMD-02 | Phase 2 | Pending |
| CMD-03 | Phase 2 | Pending |
| CMD-04 | Phase 2 | Pending |
| CMD-05 | Phase 2 | Pending |
| LOCAL-01 | Phase 3 | Pending |
| LOCAL-02 | Phase 3 | Pending |
| LOCAL-03 | Phase 3 | Pending |
| QUAL-01 | Phase 3 | Pending |
| QUAL-02 | Phase 3 | Pending |
| QUAL-03 | Phase 3 | Pending |
| QUAL-04 | Phase 1 | Pending |
| QUAL-05 | Phase 3 | Pending |
| QUAL-06 | Phase 3 | Pending |
| QUAL-07 | Phase 3 | Pending |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |
| DOCS-01 | Phase 5 | Pending |
| DOCS-02 | Phase 5 | Pending |
| DOCS-03 | Phase 5 | Pending |
| DOCS-04 | Phase 5 | Pending |
| DIST-01 | Phase 5 | Pending |
| DIST-02 | Phase 5 | Pending |
| DIST-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-09 after initial definition*

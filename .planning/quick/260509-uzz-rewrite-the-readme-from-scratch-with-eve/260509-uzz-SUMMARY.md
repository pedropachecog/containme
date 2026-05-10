---
mode: quick
quick_id: 260509-uzz
status: complete
---

# Summary: Rewrite README from scratch

## What changed

- Fully overwrote `README.md` with a fresh ~352-line version derived from current source (not from the old README).
- Sections, in order: title + elevator pitch + volume-safety callout, Requirements, Install, Quickstart, Commands reference (`run`, `run-local`, `bash`, `build`, `reset` — each with a flags table that mirrors `src/index.ts` exactly), Project config (`containme.yml`) with every supported key, Trust levels (with implementation status), Persistent data (every named volume), Built-in capabilities split per-agent, Installing extra packages (`containme-install` + per-session env vars), Installing MCP servers, Local-model workflow with anthropic-image-proxy explainer, Architecture (compose-stacking diagram + secrets-file note + session-ID + cleanup behavior), Security boundaries, File layout tree, Development, License.
- Trust-level table marks `bind` implemented; `git` flagged as "entrypoint logic exists but no compose overlay — selecting it fails at compose-file lookup"; `snapshot` flagged not yet implemented. This matches what's actually in `src/commands/run.ts` (validates against `VALID_TRUSTS = [snapshot, git, bind]`) and `compose/` (only `docker-compose.bind.yml` exists).
- Network table marks `full` and `none` implemented (`none` adds `--no-deps`); `limited` flagged not yet implemented (the code prints a warning and falls back).
- GSD asymmetry documented honestly: Claude container clones `pedropachecog/get-shit-done` GitHub fork; Codex container uses `npx get-shit-done-cc@latest` from npm. Explicit "do not normalize" note added.
- Added the absolute volume-safety rule as a blockquote callout near the top.

## Verification

| Check | Result |
|-------|--------|
| Every `.option(...)` from `src/index.ts` appears in README flags tables | PASS — `--agent`, `--trust`, `--persist`, `--isolated-caches`, `--network`, `--api-url`, `--model`, `--prompt`, `--env`, `--mount`, `--reconfigure` (run-local), `--command` (bash), `--as-agent` (bash) all present (35 total occurrences) |
| Every named volume in `compose/docker-compose*.yml` appears in persistent-data table | PASS — `claude-data`, `codex-data`, `user-npm`, `npm-cache`, `pip-cache`, `cargo-cache` all listed (11 occurrences) |
| Trust modes accurately marked | PASS — `bind` implemented, `snapshot`/`git` marked not-yet-implemented (matches code: only `docker-compose.bind.yml` exists in `compose/`) |
| Network modes accurately marked | PASS — `full`/`none` implemented, `limited` marked not-yet-implemented (matches `run.ts` warning and `--no-deps` logic) |
| GSD asymmetry documented (Claude=fork, Codex=official npm) | PASS — explicit note in "Built-in capabilities" with "do not swap" guidance |
| `wc -l README.md` between 200–500 | PASS — 352 lines |
| `grep -F "containme run"` returns matches | PASS — multiple invocations documented (`containme run .`, `containme run --agent codex …`, `containme run-local .`, etc.) |
| No invented features | PASS — only documented behavior present in code (validated against `src/index.ts`, `src/commands/run.ts`, `compose/*.yml`, `docker/scripts/entrypoint.sh`) |
| Volume-safety rule prominent | PASS — blockquote callout near top + repeated in persistent-data section |

## Sources cross-checked

- `src/index.ts` — all five subcommands and every `.option(...)`
- `src/commands/run.ts` — `VALID_TRUSTS`, `VALID_AGENTS`, `VALID_NETWORKS`, `FORBIDDEN_MOUNT_TARGETS`, network=limited warning, `--no-deps` for network=none, 128-bit session IDs, secrets file in `os.tmpdir()` mode 0600, isolated-caches volume cleanup
- `src/commands/run-local.ts` — saved config under `local:` key, default proxy URL `http://host.docker.internal:3456`
- `src/commands/reset.ts` — auth/mcp/cache shell scripts, codex+mcp soft-skip
- `src/commands/bash.ts` — fresh-shell vs. attach decision, `--as-agent`, `-c <cmd>`
- `src/commands/build.ts` — tsc → base → per-agent build order
- `src/core/compose-generator.ts` — env_file pattern, no secrets in YAML, container labels, isolated-caches volume names
- `src/core/credential-resolver.ts` — env → git config → gh token → host `.claude.json` discovery order
- `src/core/global-config.ts` — `~/.containme/config.yml` location and `local:` schema
- `src/agents/claude-code.ts`, `src/agents/codex.ts` — exact default commands (`--dangerously-skip-permissions` / `--dangerously-bypass-approvals-and-sandbox`) and env-var names
- `compose/docker-compose.yml` — caps, mem_limit/cpus/pids_limit/shm_size, host.docker.internal, npm/pip/cargo cache volumes
- `compose/docker-compose.claude.yml`, `compose/docker-compose.codex.yml` — claude-data/codex-data + user-npm volumes
- `compose/docker-compose.bind.yml` — only trust overlay that exists
- `docker/base.Dockerfile` — Ubuntu 24.04, Node 22 from node:22-slim, Python 3.12, Playwright Chromium with `/opt/google/chrome/chrome` symlink, agent UID 1000, sudo allowlist
- `docker/claude.Dockerfile`, `docker/codex.Dockerfile` — runtime CLI install rationale, bubblewrap on Codex
- `docker/scripts/entrypoint.sh` — MCP registration (context, searxng, playwright), GSD asymmetry (Claude=fork clone+build+install, Codex=npx official npm), secrets reading, package validation regex, persisted apt list
- `docker/scripts/containme-install` — persistent apt list at `/home/agent/.npm-global/.containme-apt-packages`
- `containme.yml` (root) and `package.json` — confirmed config keys and version/license

## Out-of-scope items (not done — per plan)

- No commit performed (orchestrator handles).
- No edits to `STATE.md`, `ROADMAP.md`, `PROJECT.md`, `CLAUDE.md`, or `package.json`.
- No code changes outside `README.md`.

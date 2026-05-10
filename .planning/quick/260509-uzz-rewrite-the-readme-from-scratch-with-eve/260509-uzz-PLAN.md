---
mode: quick
quick_id: 260509-uzz
description: rewrite README.md from scratch with everything containme has right now
---

# Plan: Rewrite README from scratch

## Goal

Produce a fresh README.md that documents containme's current capabilities, usage, and architecture as of HEAD. Replace the existing README entirely (no incremental edits).

## Scope

Single file: `README.md` at repo root.

## Tasks

### Task 1: Survey current state, then rewrite README.md

**files:** `README.md`

**action:**
1. Read the existing `README.md` to inventory what it currently covers.
2. Read these sources of truth to discover everything containme actually does today:
   - `src/index.ts` — every CLI command, every flag, every default
   - `src/commands/run.ts`, `src/commands/run-local.ts`, `src/commands/reset.ts`,
     `src/commands/build.ts`, `src/commands/bash.ts` — command behavior, validation,
     forbidden mounts, trust modes actually wired up
   - `src/core/compose-generator.ts`, `src/core/credential-resolver.ts`,
     `src/core/path-resolver.ts`, `src/core/global-config.ts` — how sessions are built
   - `src/agents/claude-code.ts`, `src/agents/codex.ts` — agent configs (volumes, env)
   - `compose/*.yml` — base/agent/trust overlay structure, named volumes, capabilities,
     `host.docker.internal`, network modes
   - `docker/base.Dockerfile`, `docker/claude.Dockerfile`, `docker/codex.Dockerfile` —
     pre-installed tools, Node version, OS, user/UID, entrypoint
   - `docker/scripts/entrypoint.sh` — runtime install of agent CLIs, GSD asymmetry
     (claude=fork, codex=official npm), MCP registration (SearXNG, Playwright, context),
     secrets handling, package restore
   - `docker/scripts/containme-install` — package persistence mechanism
   - `package.json` — version, scripts, deps
   - `containme.yml` (if present at repo root) — example project config
   - `.planning/PROJECT.md` (for value statement / framing only — do not copy verbatim)
3. Cross-check: every CLI flag in source must appear in the README's options tables;
   every named volume in compose files must appear in the persistent-data table;
   every MCP/tool listed in `entrypoint.sh` must appear in built-in capabilities.
4. Write a fresh `README.md` using `Write` (full overwrite). Required sections, in order:
   - Title + one-paragraph elevator pitch (what + why, links anthropic-image-proxy)
   - Requirements
   - Install (clone → npm install → npm run build → npm link → containme build)
   - Quickstart (run claude, run codex, run-local with proxy)
   - Commands reference: `run`, `run-local`, `bash`, `build`, `reset` — each with a
     flags table that matches `src/index.ts` exactly
   - Project config file (`containme.yml`) — list every supported key
   - Trust levels — mark which are implemented vs. not, based on actual code
   - Persistent data — every named volume from compose files with its mount path and contents
   - Built-in capabilities (per-agent) — Claude vs. Codex MCP/tool differences from entrypoint.sh
   - Installing extra apt/npm packages (`containme-install`, `CONTAINME_*_PACKAGES`)
   - Installing MCP servers (run as `--as-agent` so they land on `user-npm` volume)
   - Local-model workflow (anthropic-image-proxy explainer, why it exists)
   - Architecture diagram (compose stacking) + secrets-file note
   - Security boundaries (non-root, dropped caps, sudo allowlist, mount denylist,
     package-name allowlist regex, 0600 secrets, 128-bit session IDs)
   - File layout tree (must match actual `src/`, `docker/`, `compose/` contents)
   - Development (build, test, watch)
   - License (MIT, from package.json)
5. Do NOT invent features. If something is partially implemented (e.g., `snapshot`/`git`
   trust, `limited` network), mark it explicitly as "not yet implemented".
6. Keep the absolute-rule about volume safety prominent (volumes are never auto-deleted;
   `containme reset` is the targeted alternative).

**verify:**
- `grep -F "containme run" README.md` returns matches for every documented invocation
- Every flag declared in `src/index.ts` (`.option(...)`) appears at least once in README.md
- Every named volume in `compose/docker-compose*.yml` appears in the persistent-data section
- README mentions both Claude (fork) and Codex (official npm) GSD installs OR omits the
  install detail entirely — never claims both use the same source
- `wc -l README.md` is in a reasonable range (200–500 lines)

**done:**
- `README.md` rewritten from scratch
- All CLI commands and flags from `src/index.ts` documented
- Trust levels and network modes accurately marked as implemented/not-implemented
- No invented features

## Out of scope

- No code changes outside `README.md`
- No changes to PROJECT.md, CLAUDE.md, or other docs
- No changes to package.json version/description

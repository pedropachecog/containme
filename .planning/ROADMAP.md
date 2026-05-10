# Roadmap: Containme v1.0

**Created:** 2026-05-09
**Mode:** Vertical MVP (each phase delivers a usable end-to-end capability)
**Granularity:** Coarse
**Total phases:** 5

---

## Phase 1: Snapshot Trust + Diff/Approve
**Goal:** Solo dev can run `containme run -t snapshot .`, let the agent work, then `containme diff` and `containme approve` to selectively pull changes back to the host. The headline trust feature ships.
**Mode:** mvp
**Requirements:** TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-07, QUAL-04
**Success Criteria**:
1. `containme run -t snapshot <project>` succeeds end-to-end on Windows + Linux; container has a copy of project files but no bind mount to host
2. `containme diff <session>` displays an interactive diff of agent changes; `--patch` writes a `.patch` file
3. `containme approve <session>` lets the user pick files to copy back; only selected files land on host
4. The "compose file not found" silent failure for `--trust snapshot` is gone — covered by a regression test
5. `run.ts` cleanup is consolidated (no double-fire on SIGINT) — covered by a test

---

## Phase 2: Git Trust + Session Commands
**Goal:** Solo dev gets the second trust level (`git`) and the multi-session UX commands needed to actually live in containme day-to-day: `init`, `ls`, `stop`, `attach`, `clean`.
**Mode:** mvp
**Requirements:** TRUST-05, TRUST-06, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05
**Success Criteria**:
1. `containme run -t git <project>` clones the repo into a `containme/session-<id>` branch; agent commits land on that branch and are visible from the host
2. `containme init` copies the template `containme.yml` into a fresh project
3. `containme ls` lists all running sessions across projects with id / agent / trust / project columns
4. `containme stop <id|agent|project>` stops the matched session(s) cleanly
5. `containme attach <id>` attaches to a running session's TTY (separate from `bash`)
6. `containme clean` removes orphan secrets files, orphan `--isolated-caches` volumes, and stale `.containme/docker-compose.override.*.yml` files. Persistent named volumes (`claude-data`, `codex-data`, `user-npm`) are never touched.

---

## Phase 3: Local-Model Story + Quality Cleanup
**Goal:** First-class local-model UX (run-local + image-proxy docs + first-run prompt) plus the dead-code / silent-degradation fixes that make the tool trustworthy for a stranger.
**Mode:** mvp
**Requirements:** LOCAL-01, LOCAL-02, LOCAL-03, QUAL-01, QUAL-02, QUAL-03, QUAL-05, QUAL-06, QUAL-07
**Success Criteria**:
1. A new user can run `containme run-local .` and either reach a previously-saved local endpoint or be prompted once for url+model and have those persist to `~/.containme/config.yml`
2. README has a tested walkthrough for running `anthropic-image-proxy` alongside containme; image-read against llama-server works
3. `CONTAINME_AGENT` env var is set in compose so entrypoint's npm-install fallback engages on first run
4. `--network limited` is either implemented or rejects with a clear "not implemented" error (no silent fallback)
5. `containme.yml` parsing validates against a schema; unknown keys produce warnings; bogus values are rejected before any container spins up
6. `dist/` is gitignored and not checked in
7. `containme bash` matches containers by full project path (not basename) — collision between `~/work/foo` and `~/personal/foo` is impossible
8. `getPackageRoot()` only returns the package.json whose `name === "containme"`

---

## Phase 4: Test Coverage for run.ts Orchestration
**Goal:** Close the highest-priority test gap from CONCERNS.md so v1 doesn't ship with regressions in the orchestration core.
**Mode:** mvp
**Requirements:** TEST-01, TEST-02, TEST-03
**Success Criteria**:
1. `src/commands/run.ts` has direct test coverage for: SIGINT/SIGTERM handler ordering, `finally` cleanup, compose file stacking order, error paths (validation throws, spawn failure, missing compose file)
2. `--trust snapshot` and `--trust git` have happy-path AND failure-path tests; the historical "compose file not found" gap is covered by a regression test
3. `containme.yml` schema validation (from QUAL-06) is covered by tests including unknown-key warning and rejected-value cases
4. CI green on Windows + Linux runners

---

## Phase 5: README + npm Publish
**Goal:** Containme v1.0 is published, installable via `npx containme`, and a stranger can read the README and get an agent running safely on their first try.
**Mode:** mvp
**Requirements:** DOCS-01, DOCS-02, DOCS-03, DOCS-04, DIST-01, DIST-02, DIST-03
**Success Criteria**:
1. README covers: install, quickstart for `bind` / `git` / `snapshot`, local-model walkthrough with image-proxy, troubleshooting (Docker Desktop / WSL / Windows paths / volume-reset commands), and a comparison vs `docker sandbox` and `claude-code-sandbox`
2. CI runs build + tests + `npm pack --dry-run` and verifies the bundle excludes `.planning/`, source maps as appropriate, and any local-only files
3. `containme` v1.0.0 is published to npm; `npx containme run .` works on a clean machine with Docker Desktop or Linux Docker
4. v1.0.0 GitHub release is cut with release notes summarizing all five phases

---

## Coverage

All 32 v1 requirements mapped:

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-07, QUAL-04 | 6 |
| 2 | TRUST-05, TRUST-06, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05 | 7 |
| 3 | LOCAL-01, LOCAL-02, LOCAL-03, QUAL-01, QUAL-02, QUAL-03, QUAL-05, QUAL-06, QUAL-07 | 9 |
| 4 | TEST-01, TEST-02, TEST-03 | 3 |
| 5 | DOCS-01, DOCS-02, DOCS-03, DOCS-04, DIST-01, DIST-02, DIST-03 | 7 |
| **Total** | | **32** |

✓ All v1 requirements covered.

---
*Roadmap created: 2026-05-09*

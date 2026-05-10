# Roadmap

Planned and partially-implemented features that are **not** in the shipping CLI today. Anything documented in [README.md](./README.md) works now; anything below is aspirational.

## Trust levels

Today only `bind` is wired up. The CLI accepts `--trust snapshot` and `--trust git` but they fail at compose-file lookup because the matching overlays don't exist yet.

### `snapshot` — copy + diff/approve

- Take a copy of the project at session start; the agent sees its own private writable copy
- After the session ends, present a diff and let the user pick which changes to apply back to the host
- Worst-case blast radius: nothing — the host source tree is untouched until you approve

### `git` — per-session branch

- Entrypoint logic exists (clones `${WORKSPACE}.git` into `${WORKSPACE}` on a per-session branch named `containme/session-<id>`) but there is no `compose/docker-compose.git.yml` overlay
- Goal: agent commits land on a throwaway branch you can review, cherry-pick, or discard

## Network modes

`--network full` and `--network none` work today. `--network limited` is on the list:

- Allowlist a small set of egress hosts (npm, GitHub, the configured `--api-url`, etc.)
- Block everything else — useful when you want package installs and API calls but no exfiltration paths

## Container persistence

`-p, --persist` was an early plan to keep the container alive between sessions instead of `--rm`-ing it. It's intentionally absent from the README's flag tables until there's a real persist overlay. Likely shape:

- Detached `docker compose up` instead of `docker compose run --rm`
- `containme bash` already handles attaching to running sessions, so the UX scaffolding is there

## Other ideas under consideration

- `containme diff` / `containme approve` commands paired with `snapshot` trust
- Cross-platform install script that does `npm install && npm run build && npm link && containme build` in one shot
- Pre-built Docker images on a registry so first-time users don't have to `containme build`
- A `containme doctor` that checks Docker, host paths, port 3456, SearXNG reachability, and credentials in one go

If you want to push on any of these, open an issue or PR.

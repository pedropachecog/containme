#!/bin/bash
set -e

# Validate package names — reject shell metacharacters
validate_packages() {
    local input="$1"
    if [[ "$input" =~ [^a-zA-Z0-9_.+\ -] ]]; then
        echo "[containme] ERROR: Invalid characters in package list: $input" >&2
        exit 1
    fi
}

# Ensure ~/.claude.json resolves into the persistent volume so all subsystems
# (including remote control's subscriber check) find the same config file.
if [ -n "$CLAUDE_CONFIG_DIR" ] && [ ! -L /home/agent/.claude.json ]; then
    ln -sf "$CLAUDE_CONFIG_DIR/.claude.json" /home/agent/.claude.json
fi

# Install agent CLIs and tooling into the persistent user-npm volume on first
# run. Skipped on subsequent runs so Claude Code's / Codex's own auto-update
# stays authoritative for the version.
if [ "${CONTAINME_AGENT:-}" = "claude" ] && ! command -v claude >/dev/null 2>&1; then
    # Clean stale package dir from a prior failed install so npm's atomic
    # rename doesn't trip over a non-empty target.
    rm -rf /home/agent/.npm-global/lib/node_modules/@anthropic-ai/claude-code
    npm install -g @anthropic-ai/claude-code
fi

if [ "${CONTAINME_AGENT:-}" = "codex" ] && ! command -v codex >/dev/null 2>&1; then
    rm -rf /home/agent/.npm-global/lib/node_modules/@openai/codex
    npm install -g @openai/codex
fi

if ! command -v context >/dev/null 2>&1; then
    npm install -g @neuledge/context
fi

# Claude-specific setup
if command -v claude >/dev/null 2>&1; then
    # context MCP
    if ! claude mcp get context >/dev/null 2>&1; then
        claude mcp add context -- context serve
    fi

    # SearXNG — points to host SearXNG instance
    if ! claude mcp get searxng >/dev/null 2>&1; then
        claude mcp add searxng \
            -e SEARXNG_URL=http://host.docker.internal:8086 \
            -- npx -y mcp-searxng
    fi

    # Playwright — configured with chromiumSandbox:false (required in Docker containers)
    if ! claude mcp get playwright >/dev/null 2>&1; then
        PLAYWRIGHT_MCP_CONFIG="${HOME}/.playwright-mcp.json"
        cat > "$PLAYWRIGHT_MCP_CONFIG" <<'MCPEOF'
{
  "browser": {
    "type": "chromium",
    "chromiumSandbox": false,
    "launchOptions": {
      "args": ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  }
}
MCPEOF
        claude mcp add playwright \
            -e PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers \
            -- npx -y @playwright/mcp --config "$PLAYWRIGHT_MCP_CONFIG"
    fi

    # Jina Reader — points to self-hosted Jina instance on host
    if ! claude mcp get jina-reader >/dev/null 2>&1; then
        claude mcp add jina-reader \
            -e JINA_API_URL=http://host.docker.internal:3023 \
            -- uvx --from git+https://github.com/graelo/jina-reader-mcp@v0.2.0 jina-reader-mcp
    fi

    # get-shit-done — always install/update on startup (idempotent, ensures skills are current)
    # Heal ownership/perms on the entire persistent ~/.claude tree so GSD's rmSync
    # calls succeed regardless of which subdir prior installs poisoned (different UID
    # or read-only mode). This is an isolated agent sandbox — agent should own it all.
    if [ -d "${HOME}/.claude" ]; then
        sudo chown -R agent:agent "${HOME}/.claude" 2>/dev/null || true
        chmod -R u+w "${HOME}/.claude" 2>/dev/null || true
    fi
    (
        set -e
        git clone https://github.com/pedropachecog/get-shit-done.git /tmp/gsd-install
        cd /tmp/gsd-install
        npm ci
        npm run build:hooks
        npm run build:sdk
        node bin/install.js --claude --global
    )
    rm -rf /tmp/gsd-install

    # GSD installs commands to ~/.claude/commands/gsd/*.md but Claude Code's
    # Skill tool reads from ~/.claude/skills/<name>/SKILL.md. Mirror each GSD
    # command as a skill so /gsd:* works with the Skill tool.
    if [ -d "${HOME}/.claude/commands/gsd" ]; then
        mkdir -p "${HOME}/.claude/skills"
        for cmd in "${HOME}/.claude/commands/gsd"/*.md; do
            [ -f "$cmd" ] || continue
            name="gsd:$(basename "$cmd" .md)"
            skill_dir="${HOME}/.claude/skills/${name}"
            # Only copy if source is newer or dest doesn't exist
            if [ ! -f "${skill_dir}/SKILL.md" ] || [ "$cmd" -nt "${skill_dir}/SKILL.md" ]; then
                mkdir -p "$skill_dir"
                cp "$cmd" "${skill_dir}/SKILL.md"
            fi
        done
    fi
fi

# Codex-specific setup
if command -v codex >/dev/null 2>&1; then
    # context MCP via config.toml (idempotent)
    CODEX_CONFIG="${CODEX_HOME:-${HOME}/.codex}/config.toml"
    if [ ! -f "$CODEX_CONFIG" ] || ! grep -q '\[mcp_servers.context\]' "$CODEX_CONFIG"; then
        mkdir -p "$(dirname "$CODEX_CONFIG")"
        cat >> "$CODEX_CONFIG" <<'TOMLEOF'

[mcp_servers.context]
command = "context"
args = ["serve"]
TOMLEOF
    fi

    # get-shit-done — always install/update on startup (idempotent, ensures skills are current)
    # Heal ownership/perms on persistent ~/.codex so GSD's rmSync calls succeed regardless
    # of which UID/mode prior installs left behind. Isolated sandbox — agent owns it all.
    if [ -d "${HOME}/.codex" ]; then
        sudo chown -R agent:agent "${HOME}/.codex" 2>/dev/null || true
        chmod -R u+w "${HOME}/.codex" 2>/dev/null || true
    fi
    npx -y @opengsd/get-shit-done-redux@latest --codex --global
fi

# Git safety: bind-mounted workspaces and GSD-created worktrees often have
# mismatched ownership between the worktree and .git (host uid vs agent uid),
# which trips Git's "dubious ownership" guard. Trust everything inside the
# container — this is an isolated agent sandbox.
git config --global --add safe.directory '*'

# Read Docker secrets if available
if [ -f /run/secrets/anthropic_api_key ]; then
    export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic_api_key)
fi

if [ -f /run/secrets/openai_api_key ]; then
    export OPENAI_API_KEY=$(cat /run/secrets/openai_api_key)
fi

# Configure git user if env vars are set
if [ -n "$GIT_USER_NAME" ]; then
    git config --global user.name "$GIT_USER_NAME"
fi

if [ -n "$GIT_USER_EMAIL" ]; then
    git config --global user.email "$GIT_USER_EMAIL"
fi

# Git trust mode: clone from bare repo into workspace
if [ "$CONTAINME_TRUST_MODE" = "git" ]; then
    WORKSPACE="${CONTAINME_WORKSPACE_PATH:-/workspace}"
    git clone "${WORKSPACE}.git" "${WORKSPACE}" --branch "containme/session-${CONTAINME_SESSION_ID}"
fi

# Reinstall persisted apt packages from previous sessions
PERSIST_FILE="/home/agent/.npm-global/.containme-apt-packages"
if [ -f "$PERSIST_FILE" ] && [ -s "$PERSIST_FILE" ]; then
    PERSISTED_PKGS=$(tr '\n' ' ' < "$PERSIST_FILE")
    validate_packages "$PERSISTED_PKGS"
    # Only install packages not already present
    MISSING_PKGS=""
    for pkg in $PERSISTED_PKGS; do
        if ! dpkg -s "$pkg" >/dev/null 2>&1; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
        fi
    done
    if [ -n "$MISSING_PKGS" ]; then
        echo "[containme] Reinstalling persisted packages:$MISSING_PKGS"
        sudo apt-get update && sudo apt-get install -y $MISSING_PKGS
    fi
fi

# Install additional packages if requested (validated against injection)
if [ -n "$CONTAINME_APT_PACKAGES" ]; then
    validate_packages "$CONTAINME_APT_PACKAGES"
    sudo apt-get update && sudo apt-get install -y $CONTAINME_APT_PACKAGES
fi

if [ -n "$CONTAINME_NPM_PACKAGES" ]; then
    validate_packages "$CONTAINME_NPM_PACKAGES"
    npm install -g $CONTAINME_NPM_PACKAGES
fi

if [ -n "$CONTAINME_PIP_PACKAGES" ]; then
    validate_packages "$CONTAINME_PIP_PACKAGES"
    pip install $CONTAINME_PIP_PACKAGES
fi

clear
exec "$@"

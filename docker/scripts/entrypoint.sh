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

# Install @neuledge/context to persistent user-npm volume if not already present
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

    # get-shit-done — always install/update on startup (idempotent, ensures skills are current)
    git clone https://github.com/pedropachecog/get-shit-done.git /tmp/gsd-install 2>/dev/null \
        && node /tmp/gsd-install/bin/install.js --claude --global \
        && rm -rf /tmp/gsd-install \
        || rm -rf /tmp/gsd-install

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
    npx -y get-shit-done-cc --codex --global 2>/dev/null || true
fi

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

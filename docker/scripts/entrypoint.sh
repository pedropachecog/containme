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

# Register searxng MCP server (points to host SearXNG instance)
# Only adds it if not already configured — idempotent.
if command -v claude >/dev/null 2>&1; then
    if ! claude mcp get searxng >/dev/null 2>&1; then
        claude mcp add searxng \
            -e SEARXNG_URL=http://host.docker.internal:8086 \
            -- npx -y mcp-searxng
    fi
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
    git clone /workspace.git /workspace --branch "containme/session-${CONTAINME_SESSION_ID}"
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

exec "$@"

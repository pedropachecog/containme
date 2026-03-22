#!/bin/bash
set -e

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

# Install additional packages if requested
if [ -n "$CONTAINME_APT_PACKAGES" ]; then
    sudo apt-get update && sudo apt-get install -y $CONTAINME_APT_PACKAGES
fi

if [ -n "$CONTAINME_NPM_PACKAGES" ]; then
    npm install -g $CONTAINME_NPM_PACKAGES
fi

if [ -n "$CONTAINME_PIP_PACKAGES" ]; then
    pip install $CONTAINME_PIP_PACKAGES
fi

exec "$@"

FROM containme-base

# Claude Code is installed at runtime by entrypoint.sh into the user-level
# npm prefix (/home/agent/.npm-global), which lives on a persistent volume.
# This lets Claude Code's built-in auto-update write without root and have
# the new version persist across container recreates.

RUN mkdir -p /home/agent/.claude

ENV CLAUDE_CONFIG_DIR="/home/agent/.claude"
ENV CONTAINME_AGENT=claude

CMD ["claude", "--dangerously-skip-permissions"]

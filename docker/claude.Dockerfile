FROM containme-base

# Install Claude Code via npm (aligned with Anthropic's official devcontainer)
USER root
RUN npm install -g @anthropic-ai/claude-code \
    && chown -R agent:agent /usr/local/lib/node_modules/@anthropic-ai/claude-code
USER agent

# Pre-create directories so Docker initializes volumes with agent:agent ownership
RUN mkdir -p /home/agent/.claude /home/agent/.npm-global

# Auth and config persist via the claude-data volume mounted at ~/.claude
ENV CLAUDE_CONFIG_DIR="/home/agent/.claude"

CMD ["claude", "--dangerously-skip-permissions"]

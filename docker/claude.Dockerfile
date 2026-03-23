FROM containme-base

# Install Claude Code via npm (aligned with Anthropic's official devcontainer)
USER root
RUN npm install -g @anthropic-ai/claude-code
USER agent

# Pre-create .claude directory so Docker copies agent:agent ownership to the volume
RUN mkdir -p /home/agent/.claude

# Auth and config persist via the claude-config volume mounted at ~/.claude
ENV CLAUDE_CONFIG_DIR="/home/agent/.claude"

# Install skills and plugins for Claude Code
RUN npx skills add https://github.com/vercel-labs/skills --skill find-skills \
    && npx skills add obra/superpowers

CMD ["claude", "--dangerously-skip-permissions"]

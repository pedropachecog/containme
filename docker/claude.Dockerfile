FROM containme-base

USER root
RUN npm install -g @anthropic-ai/claude-code
USER agent

RUN mkdir -p /home/agent/.claude

CMD ["claude", "--dangerously-skip-permissions"]

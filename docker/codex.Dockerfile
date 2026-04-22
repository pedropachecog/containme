FROM containme-base

USER root
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g @openai/codex
USER agent

RUN mkdir -p /home/agent/.codex /home/agent/.npm-global
ENV CODEX_HOME="/home/agent/.codex"


CMD ["codex", "--dangerously-bypass-approvals-and-sandbox"]

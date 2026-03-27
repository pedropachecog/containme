FROM containme-base

USER root
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g @openai/codex
USER agent

RUN mkdir -p /home/agent/.codex
ENV CODEX_HOME="/home/agent/.codex"

# Install skills and plugins
RUN npx skills add https://github.com/vercel-labs/skills --skill find-skills

CMD ["codex", "--dangerously-bypass-approvals-and-sandbox"]

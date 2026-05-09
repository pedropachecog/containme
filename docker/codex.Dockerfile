FROM containme-base

USER root
RUN apt-get update && apt-get install -y --no-install-recommends bubblewrap \
    && rm -rf /var/lib/apt/lists/*
USER agent

# Codex is installed at runtime by entrypoint.sh into the user-level npm
# prefix so updates persist via the npm-global volume.

RUN mkdir -p /home/agent/.codex
ENV CODEX_HOME="/home/agent/.codex"
ENV CONTAINME_AGENT=codex


CMD ["codex", "--dangerously-bypass-approvals-and-sandbox"]

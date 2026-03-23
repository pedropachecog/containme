FROM containme-base

USER root
RUN npm install -g @openai/codex
USER agent

RUN mkdir -p /home/agent/.codex
ENV CODEX_HOME="/home/agent/.codex"

CMD ["codex", "--dangerously-bypass-approvals-and-sandbox"]

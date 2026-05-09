FROM node:22-slim AS node-source

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
# Install Playwright browsers to a system-wide path so all users can access them
# and so they survive volume mounts over ~/.cache
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers

# Copy Node.js from official image (M4 — avoids curl|bash supply chain risk)
COPY --from=node-source /usr/local/bin/node /usr/local/bin/node
COPY --from=node-source /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Install system packages, Python 3.12, and tools
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        make \
        cmake \
        git \
        curl \
        wget \
        jq \
        ripgrep \
        fd-find \
        unzip \
        zip \
        openssh-client \
        ca-certificates \
        sudo \
        software-properties-common \
        gnupg \
        python3.12 \
        python3-pip \
        python3.12-venv \
        pandoc \
        libreoffice-writer-nogui \
        libreoffice-calc-nogui \
        libreoffice-impress-nogui \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && npm install -g pnpm yarn \
    && pip install --break-system-packages uv \
    && npx playwright install-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Chromium browser binary to system path and create Google Chrome compatibility symlink
# (Playwright MCP looks for Chrome at /opt/google/chrome/chrome)
RUN npx playwright install chromium \
    && mkdir -p /opt/google/chrome \
    && ln -sf $(find /opt/playwright-browsers -name chrome -type f | head -1) /opt/google/chrome/chrome \
    && chmod -R a+rwx /opt/playwright-browsers \
    && chmod a+x /opt/google/chrome/chrome

# Create non-root user "agent" with sudo access
# Remove existing UID 1000 user (ubuntu) if present, then create agent
RUN userdel -r $(getent passwd 1000 | cut -d: -f1) 2>/dev/null || true \
    && useradd -m -s /bin/bash -u 1000 agent \
    && echo "agent ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/bin/chown, /bin/chown" > /etc/sudoers.d/agent \
    && chmod 0440 /etc/sudoers.d/agent

COPY docker/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/scripts/containme-install /usr/local/bin/containme-install
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && sed -i 's/\r$//' /usr/local/bin/containme-install \
    && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/containme-install

USER agent

# User-level npm prefix so global installs (and Claude Code / Codex auto-updates)
# work without root. Persisted via the npm-global volume so updates survive
# container recreation.
ENV NPM_CONFIG_PREFIX=/home/agent/.npm-global
ENV PATH=/home/agent/.npm-global/bin:$PATH

# Create cache directories
RUN mkdir -p /home/agent/.npm /home/agent/.npm-global/bin /home/agent/.cache/pip /home/agent/.cargo/registry

WORKDIR /workspace

ENTRYPOINT ["entrypoint.sh"]

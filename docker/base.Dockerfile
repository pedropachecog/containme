FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system packages, Node.js 22 LTS, Python 3.12, and tools
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
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && npm install -g pnpm yarn \
    && pip install --break-system-packages uv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user "agent" with sudo access
RUN useradd -m -s /bin/bash -u 1000 agent \
    && echo "agent ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/agent \
    && chmod 0440 /etc/sudoers.d/agent

COPY docker/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
    && chmod +x /usr/local/bin/entrypoint.sh

USER agent

# Create cache directories
RUN mkdir -p /home/agent/.npm /home/agent/.cache/pip /home/agent/.cargo/registry

WORKDIR /workspace

ENTRYPOINT ["entrypoint.sh"]

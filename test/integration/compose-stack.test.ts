import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parse } from "yaml";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const composeDir = path.resolve(thisDir, "../../compose");

function loadYaml(filename: string) {
  const filePath = path.join(composeDir, filename);
  return parse(readFileSync(filePath, "utf-8"));
}

describe("compose file stack", () => {
  it("base compose file exists and defines agent service", () => {
    const base = loadYaml("docker-compose.yml");
    expect(base.services.agent).toBeDefined();
  });

  it("base compose has security hardening (H1)", () => {
    const base = loadYaml("docker-compose.yml");
    const agent = base.services.agent;
    // no-new-privileges removed: incompatible with sudo (agent needs apt-get)
    expect(agent.security_opt).toBeUndefined();
    expect(agent.cap_drop).toContain("ALL");
    expect(agent.cap_add).toContain("CHOWN");
    expect(agent.cap_add).toContain("SETUID");
    expect(agent.cap_add).toContain("SETGID");
    expect(agent.cap_add).toContain("DAC_OVERRIDE");
  });

  it("base compose does NOT use deploy.resources.limits (H2)", () => {
    const base = loadYaml("docker-compose.yml");
    expect(base.services.agent.deploy).toBeUndefined();
  });

  it("base compose defines cache volumes", () => {
    const base = loadYaml("docker-compose.yml");
    expect(base.volumes).toHaveProperty("npm-cache");
    expect(base.volumes).toHaveProperty("pip-cache");
    expect(base.volumes).toHaveProperty("cargo-cache");
  });

  it("base compose maps host.docker.internal", () => {
    const base = loadYaml("docker-compose.yml");
    expect(base.services.agent.extra_hosts).toContainEqual(
      "host.docker.internal:host-gateway",
    );
  });

  it("claude overlay exists and sets ANTHROPIC_API_KEY", () => {
    const claude = loadYaml("docker-compose.claude.yml");
    expect(claude.services.agent.environment).toContain("ANTHROPIC_API_KEY");
  });

  it("claude overlay defines claude-data volume", () => {
    const claude = loadYaml("docker-compose.claude.yml");
    expect(claude.volumes).toHaveProperty("claude-data");
  });

  it("claude overlay sets CLAUDE_CONFIG_DIR", () => {
    const claude = loadYaml("docker-compose.claude.yml");
    expect(claude.services.agent.environment).toContain(
      "CLAUDE_CONFIG_DIR=/home/agent/.claude",
    );
  });

  it("bind overlay uses CONTAINME_PROJECT_PATH variable", () => {
    const bind = loadYaml("docker-compose.bind.yml");
    const volumes = bind.services.agent.volumes;
    const hasProjectMount = volumes.some((v: string) =>
      v.includes("CONTAINME_PROJECT_PATH"),
    );
    expect(hasProjectMount).toBe(true);
  });

  it("codex overlay exists and sets OPENAI_API_KEY", () => {
    const codex = loadYaml("docker-compose.codex.yml");
    expect(codex.services.agent.environment).toContain("OPENAI_API_KEY");
  });

  it("codex overlay defines codex-data volume", () => {
    const codex = loadYaml("docker-compose.codex.yml");
    expect(codex.volumes).toHaveProperty("codex-data");
  });

  it("codex overlay sets CODEX_HOME", () => {
    const codex = loadYaml("docker-compose.codex.yml");
    expect(codex.services.agent.environment).toContain(
      "CODEX_HOME=/home/agent/.codex",
    );
  });

  it("codex overlay mounts codex-data volume", () => {
    const codex = loadYaml("docker-compose.codex.yml");
    expect(codex.services.agent.volumes).toContain(
      "codex-data:/home/agent/.codex",
    );
  });

  it("all referenced compose files exist", () => {
    const files = [
      "docker-compose.yml",
      "docker-compose.claude.yml",
      "docker-compose.bind.yml",
      "docker-compose.codex.yml",
    ];
    for (const f of files) {
      expect(existsSync(path.join(composeDir, f))).toBe(true);
    }
  });
});

describe("Dockerfile validation", () => {
  const dockerDir = path.resolve(thisDir, "../../docker");

  it("base Dockerfile exists", () => {
    expect(existsSync(path.join(dockerDir, "base.Dockerfile"))).toBe(true);
  });

  it("base Dockerfile restricts sudo to apt-get only (C2)", () => {
    const content = readFileSync(
      path.join(dockerDir, "base.Dockerfile"),
      "utf-8",
    );
    expect(content).toMatch(/NOPASSWD:.*\/usr\/bin\/apt-get/);
    expect(content).not.toMatch(/NOPASSWD:\s*ALL/);
  });

  it("base Dockerfile uses official Node image (M4)", () => {
    const content = readFileSync(
      path.join(dockerDir, "base.Dockerfile"),
      "utf-8",
    );
    expect(content).toMatch(/COPY --from=node/);
    expect(content).not.toMatch(/nodesource/i);
  });

  it("claude Dockerfile extends containme-base and uses npm install", () => {
    const content = readFileSync(
      path.join(dockerDir, "claude.Dockerfile"),
      "utf-8",
    );
    expect(content).toMatch(/^FROM containme-base/m);
    expect(content).toContain("npm install -g @anthropic-ai/claude-code");
    expect(content).not.toContain("claude.ai/install.sh");
  });

  it("claude Dockerfile installs skills and superpowers", () => {
    const content = readFileSync(
      path.join(dockerDir, "claude.Dockerfile"),
      "utf-8",
    );
    expect(content).toContain("npx skills add");
    expect(content).toContain("obra/superpowers");
    expect(content).toContain("find-skills");
  });

  it("codex Dockerfile exists and extends containme-base", () => {
    const content = readFileSync(
      path.join(dockerDir, "codex.Dockerfile"),
      "utf-8",
    );
    expect(content).toMatch(/^FROM containme-base/m);
  });

  it("codex Dockerfile sets CODEX_HOME", () => {
    const content = readFileSync(
      path.join(dockerDir, "codex.Dockerfile"),
      "utf-8",
    );
    expect(content).toContain('CODEX_HOME="/home/agent/.codex"');
  });

  it("entrypoint script exists", () => {
    expect(
      existsSync(path.join(dockerDir, "scripts", "entrypoint.sh")),
    ).toBe(true);
  });

  it("entrypoint validates package names (C3)", () => {
    const content = readFileSync(
      path.join(dockerDir, "scripts", "entrypoint.sh"),
      "utf-8",
    );
    expect(content).toContain("validate_packages");
  });
});

describe("build context safety (M5/M7)", () => {
  const projectRoot = path.resolve(thisDir, "../..");

  it(".dockerignore exists", () => {
    expect(existsSync(path.join(projectRoot, ".dockerignore"))).toBe(true);
  });

  it(".dockerignore excludes sensitive paths", () => {
    const content = readFileSync(
      path.join(projectRoot, ".dockerignore"),
      "utf-8",
    );
    expect(content).toContain(".git");
    expect(content).toContain(".env");
    expect(content).toContain("node_modules");
    expect(content).toContain(".containme");
  });

  it(".gitignore excludes .containme/", () => {
    const content = readFileSync(
      path.join(projectRoot, ".gitignore"),
      "utf-8",
    );
    expect(content).toContain(".containme/");
  });
});

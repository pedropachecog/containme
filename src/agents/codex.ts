import type { AgentConfig } from "./claude-code.js";

export const codexConfig: AgentConfig = {
  name: "codex",
  displayName: "OpenAI Codex",
  composeFile: "docker-compose.codex.yml",
  envVars: {},
  defaultCommand: ["codex", "--dangerously-bypass-approvals-and-sandbox"],
  apiKeyEnvVar: "OPENAI_API_KEY",
  apiUrlEnvVar: "OPENAI_BASE_URL",
};

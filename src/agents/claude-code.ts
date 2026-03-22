export interface AgentConfig {
  name: string;
  displayName: string;
  composeFile: string;
  envVars: Record<string, string>;
  defaultCommand: string[];
  apiKeyEnvVar: string;
  apiUrlEnvVar: string;
}

export const claudeCodeConfig: AgentConfig = {
  name: "claude",
  displayName: "Claude Code",
  composeFile: "docker-compose.claude.yml",
  envVars: {},
  defaultCommand: ["claude", "--dangerously-skip-permissions"],
  apiKeyEnvVar: "ANTHROPIC_API_KEY",
  apiUrlEnvVar: "ANTHROPIC_BASE_URL",
};

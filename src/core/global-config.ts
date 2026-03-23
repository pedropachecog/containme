import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface LocalModelConfig {
  "api-url": string;
  model: string;
}

export interface GlobalConfig {
  local?: LocalModelConfig;
}

const CONFIG_DIR = path.join(os.homedir(), ".containme");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.yml");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadGlobalConfig(): GlobalConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return parseYaml(raw) ?? {};
  } catch {
    return {};
  }
}

export function saveGlobalConfig(config: GlobalConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, stringifyYaml(config), "utf-8");
}

export function getLocalModelConfig(): LocalModelConfig | undefined {
  const config = loadGlobalConfig();
  if (config.local?.["api-url"] && config.local?.model) {
    return config.local;
  }
  return undefined;
}

export function saveLocalModelConfig(apiUrl: string, model: string): void {
  const config = loadGlobalConfig();
  config.local = { "api-url": apiUrl, model };
  saveGlobalConfig(config);
}

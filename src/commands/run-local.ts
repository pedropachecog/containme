import { input } from "@inquirer/prompts";
import chalk from "chalk";

import { getLocalModelConfig, saveLocalModelConfig, getConfigPath } from "../core/global-config.js";
import { runCommand } from "./run.js";
import type { RunCommandOptions } from "./run.js";

export interface RunLocalCommandOptions {
  agent: string;
  trust: string;
  persist: boolean;
  isolatedCaches: boolean;
  network: string;
  apiUrl?: string;
  model?: string;
  prompt?: string;
  env: string[];
  mount: string[];
  reconfigure: boolean;
}

export async function runLocalCommand(
  projectPath: string,
  opts: RunLocalCommandOptions,
): Promise<void> {
  let apiUrl = opts.apiUrl;
  let model = opts.model;

  // Load saved config unless --reconfigure
  if (!opts.reconfigure) {
    const saved = getLocalModelConfig();
    if (saved) {
      apiUrl = apiUrl ?? saved["api-url"];
      model = model ?? saved.model;
    }
  }

  // Prompt for missing values
  if (!apiUrl || !model || opts.reconfigure) {
    console.log(chalk.cyan("[containme] Local model configuration"));
    console.log(chalk.gray(`Config file: ${getConfigPath()}\n`));

    apiUrl = apiUrl ?? await input({
      message: "API URL (e.g., http://host.docker.internal:8001)",
      default: "http://host.docker.internal:8001",
    });

    model = model ?? await input({
      message: "Model name (e.g., unsloth/Qwen3.5-27B)",
    });

    saveLocalModelConfig(apiUrl, model);
    console.log(chalk.green(`\nSaved to ${getConfigPath()}`));
  }

  console.log(chalk.cyan(`[containme] Using local model: ${model} via ${apiUrl}`));

  const runOpts: RunCommandOptions = {
    agent: opts.agent,
    trust: opts.trust,
    persist: opts.persist,
    isolatedCaches: opts.isolatedCaches,
    network: opts.network,
    apiUrl,
    model,
    prompt: opts.prompt,
    env: opts.env,
    mount: opts.mount,
  };

  await runCommand(projectPath, runOpts);
}

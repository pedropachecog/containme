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

  const saved = getLocalModelConfig();

  if (!opts.reconfigure && saved) {
    // Config fully loaded — use it directly, no prompts
    apiUrl = apiUrl ?? saved["api-url"];
    model = model ?? saved.model;
  } else {
    // First run or --reconfigure: prompt with saved values as defaults
    console.log(chalk.cyan("[containme] Local model configuration"));
    console.log(chalk.gray(`Config file: ${getConfigPath()}\n`));

    apiUrl = await input({
      message: "API URL",
      default: apiUrl ?? saved?.["api-url"] ?? "http://host.docker.internal:3456",
      validate: (v) => v.trim() ? true : "Required",
    });

    model = await input({
      message: "Model name",
      default: model ?? saved?.model,
      validate: (v) => v.trim() ? true : "Required",
    });

    saveLocalModelConfig(apiUrl.trim(), model.trim());
    console.log(chalk.green(`Saved to ${getConfigPath()}\n`));
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

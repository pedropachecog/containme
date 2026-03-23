#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import { runCommand } from "./commands/run.js";
import { runLocalCommand } from "./commands/run-local.js";

/** Load containme.yml from the project directory and return defaults. */
function loadConfig(projectPath: string): Record<string, unknown> {
  const configPath = path.resolve(projectPath, "containme.yml");
  try {
    const raw = readFileSync(configPath, "utf-8");
    return parseYaml(raw) ?? {};
  } catch {
    return {};
  }
}

const program = new Command();

program
  .name("containme")
  .description("Safely run AI coding agents in Docker containers")
  .version("0.1.0");

program
  .command("run")
  .description("Run an AI coding agent inside a Docker container")
  .argument("[project-path]", "Path to the project directory", ".")
  .option("-a, --agent <agent>", "Agent to use (claude|codex)", "claude")
  .option("-t, --trust <level>", "Trust level (snapshot|git|bind)", "bind")
  .option("-p, --persist", "Persist container state between sessions", false)
  .option("--isolated-caches", "Use session-scoped caches (fresh npm/pip/cargo each session)", false)
  .option("--network <mode>", "Network mode (full|limited|none)", "full")
  .option("--api-url <url>", "Custom API URL (for local models)")
  .option("--model <model>", "Model name to use (e.g., unsloth/Qwen3-Coder-Next)")
  .option("--prompt <prompt>", "Initial prompt to send to the agent")
  .option("-e, --env <var>", "Environment variable to pass (repeatable)", collect, [])
  .option("-m, --mount <mount>", "Additional bind mount (repeatable)", collect, [])
  .action(async (projectPath: string | undefined, opts) => {
    const resolvedPath = projectPath ?? ".";
    const config = loadConfig(resolvedPath);

    // Config file values are defaults — CLI flags always win
    await runCommand(resolvedPath, {
      agent: opts.agent !== "claude" || !config.agent ? opts.agent : String(config.agent),
      trust: opts.trust !== "bind" || !config.trust ? opts.trust : String(config.trust),
      persist: opts.persist || Boolean(config.persist),
      isolatedCaches: opts.isolatedCaches || Boolean(config["isolated-caches"]),
      network: opts.network !== "full" || !config.network ? opts.network : String(config.network),
      apiUrl: opts.apiUrl ?? (config["api-url"] as string | undefined),
      model: opts.model ?? (config.model as string | undefined),
      prompt: opts.prompt ?? (config.prompt as string | undefined),
      env: opts.env.length > 0 ? opts.env : (config.env as string[] ?? []),
      mount: opts.mount.length > 0 ? opts.mount : (config.mount as string[] ?? []),
    });
  });

program
  .command("run-local")
  .description("Run an AI agent with a local model server (saves config globally)")
  .argument("[project-path]", "Path to the project directory", ".")
  .option("-a, --agent <agent>", "Agent to use (claude|codex)", "claude")
  .option("-t, --trust <level>", "Trust level (snapshot|git|bind)", "bind")
  .option("-p, --persist", "Persist container state between sessions", false)
  .option("--isolated-caches", "Use session-scoped caches (fresh npm/pip/cargo each session)", false)
  .option("--network <mode>", "Network mode (full|limited|none)", "full")
  .option("--api-url <url>", "Override saved API URL")
  .option("--model <model>", "Override saved model name")
  .option("--prompt <prompt>", "Initial prompt to send to the agent")
  .option("-e, --env <var>", "Environment variable to pass (repeatable)", collect, [])
  .option("-m, --mount <mount>", "Additional bind mount (repeatable)", collect, [])
  .option("--reconfigure", "Re-prompt for local model settings", false)
  .action(async (projectPath: string | undefined, opts) => {
    const resolvedPath = projectPath ?? ".";
    await runLocalCommand(resolvedPath, {
      agent: opts.agent,
      trust: opts.trust,
      persist: opts.persist,
      isolatedCaches: opts.isolatedCaches,
      network: opts.network,
      apiUrl: opts.apiUrl,
      model: opts.model,
      prompt: opts.prompt,
      env: opts.env,
      mount: opts.mount,
      reconfigure: opts.reconfigure,
    });
  });

program.parse();

/** Collector for repeatable options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

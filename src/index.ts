#!/usr/bin/env node

import { Command } from "commander";
import { runCommand } from "./commands/run.js";

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
  .option("--network <mode>", "Network mode (full|limited|none)", "full")
  .option("--api-url <url>", "Custom API URL (for local models)")
  .option("--prompt <prompt>", "Initial prompt to send to the agent")
  .option("-e, --env <var>", "Environment variable to pass (repeatable)", collect, [])
  .option("-m, --mount <mount>", "Additional bind mount (repeatable)", collect, [])
  .action(async (projectPath: string | undefined, opts) => {
    await runCommand(projectPath, {
      agent: opts.agent,
      trust: opts.trust,
      persist: opts.persist,
      network: opts.network,
      apiUrl: opts.apiUrl,
      prompt: opts.prompt,
      env: opts.env,
      mount: opts.mount,
    });
  });

program.parse();

/** Collector for repeatable options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

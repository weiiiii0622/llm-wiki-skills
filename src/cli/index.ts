#!/usr/bin/env node
import { initCommand } from "./commands/init.js";
import { healthCommand } from "./commands/health.js";
import { lintCommand } from "./commands/lint.js";
import { graphCommand } from "./commands/graph.js";
import { LlmWikiError } from "../core/errors.js";
import type { CommandOptions } from "../core/types.js";

const COMMANDS = new Set(["init", "health", "lint", "graph"]);

async function main(argv: string[]): Promise<void> {
  const { command, options, check } = parseArgs(argv);
  switch (command) {
    case "init":
      await initCommand(options);
      return;
    case "health":
      await healthCommand(options);
      return;
    case "lint":
      await lintCommand(options);
      return;
    case "graph":
      await graphCommand(options, check);
      return;
    default:
      usage();
      process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): { command: string; options: CommandOptions; check: boolean } {
  const args = [...argv];
  const command = args.shift() ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }
  if (!COMMANDS.has(command)) return { command, options: defaults(), check: false };
  const options = defaults();
  let check = false;
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--root") {
      const value = args.shift();
      if (!value) throw new Error("--root requires a path");
      options.root = value;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--debug") {
      options.debug = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--check") {
      check = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { command, options, check };
}

function defaults(): CommandOptions {
  return {
    root: process.cwd(),
    json: false,
    debug: false,
    quiet: false
  };
}

function usage(): void {
  process.stdout.write(`llm-wiki-skills

Usage:
  llm-wiki-skills init [--root DIR] [--json] [--quiet]
  llm-wiki-skills health [--root DIR] [--json] [--quiet]
  llm-wiki-skills lint [--root DIR] [--json] [--quiet]
  llm-wiki-skills graph [--root DIR] [--json] [--quiet] [--check]

First run:
  npx llm-wiki-skills init
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof LlmWikiError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exit(error.exitCode);
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});

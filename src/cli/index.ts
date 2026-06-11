#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { LlmWikiError } from "../core/errors.js";
import { parseHostValues } from "../core/hosts.js";
import type { CommandOptions } from "../core/types.js";

const COMMANDS = new Set(["init", "status"]);

async function main(argv: string[]): Promise<void> {
  const { command, options } = parseCommand(argv);
  switch (command) {
    case "init":
      await initCommand(options);
      return;
    case "status":
      await statusCommand(options);
      return;
    default:
      usage();
      process.exitCode = 1;
  }
}

export function parseCommand(argv: string[]): { command: string; options: CommandOptions } {
  const args = [...argv];
  const command = args.shift() ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }
  if (!COMMANDS.has(command)) return { command, options: defaults() };
  const options = defaults();
  const hostValues: string[] = [];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--root") {
      const value = args.shift();
      if (!value) throw new Error("--root requires a path");
      options.root = value;
    } else if (arg === "--host") {
      const value = args.shift();
      if (!value) throw new Error("--host requires a value");
      hostValues.push(value);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--debug") {
      options.debug = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  options.hosts = parseHostValues(hostValues);
  return { command, options };
}

function defaults(): CommandOptions {
  return {
    root: process.cwd(),
    json: false,
    debug: false,
    quiet: false,
    hosts: []
  };
}

function usage(): void {
  process.stdout.write(`llm-wiki-skills

Usage:
  llm-wiki-skills init [--root DIR] [--host codex|claude-code] [--json] [--quiet]
  llm-wiki-skills status [--root DIR] [--json] [--quiet]

First run:
  npx llm-wiki-skills init --host codex
`);
}

if (isCliEntrypoint()) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof LlmWikiError) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
      process.exit(error.exitCode);
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  });
}

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) || path.basename(process.argv[1]) === "llm-wiki-skills";
}

#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { ConflictingObsidianOptionError, LlmWikiError } from "../core/errors.js";
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
  let obsidianEnabled = false;
  let obsidianDisabled = false;
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
    } else if (arg === "--topic") {
      const value = args.shift();
      if (!value) throw new Error("--topic requires a value");
      options.topicValues.push(value);
    } else if (arg === "--template") {
      const value = args.shift();
      if (!value) throw new Error("--template requires a value");
      options.templateValues.push(value);
    } else if (arg === "--custom-topic") {
      const value = args.shift();
      if (!value) throw new Error("--custom-topic requires a value");
      options.customTopic = value;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--debug") {
      options.debug = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--obsidian") {
      obsidianEnabled = true;
      options.obsidian = true;
    } else if (arg === "--no-obsidian") {
      obsidianDisabled = true;
      options.obsidian = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (obsidianEnabled && obsidianDisabled) throw new ConflictingObsidianOptionError();
  options.hosts = parseHostValues(hostValues);
  return { command, options };
}

function defaults(): CommandOptions {
  return {
    root: process.cwd(),
    json: false,
    debug: false,
    quiet: false,
    hosts: [],
    topicValues: [],
    templateValues: []
  };
}

function usage(): void {
  process.stdout.write(`llm-wiki-skills

Install local LLM Wiki skills for AI agents. The generated skills teach
Codex or Claude Code to ingest sources, answer from the wiki, and
health-check the wiki over time.

Usage:
  llm-wiki-skills init [--root DIR] [--host codex|claude-code] [--topic ID] [--obsidian|--no-obsidian] [--json] [--quiet]
  llm-wiki-skills status [--root DIR] [--json] [--quiet]

Hosts:
  codex        writes repo skills to .agents/skills
  claude-code  writes project skills to .claude/skills

Topics:
  general, study-research, work-project, product-builder, writing-content,
  trip-plan, finance, home-life, medical, legal-admin, custom

First run:
  npx llm-wiki-skills init
`);
}

if (isCliEntrypoint()) {
  main(process.argv.slice(2))
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error: unknown) => {
      if (error instanceof LlmWikiError) {
        process.stderr.write(`${error.message}\n`);
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

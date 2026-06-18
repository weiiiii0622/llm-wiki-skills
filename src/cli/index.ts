#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initCommand } from "./commands/init.js";
import { qmdCommand } from "./commands/qmd.js";
import { ingestCommand } from "./commands/ingest.js";
import { webCommand } from "./commands/web.js";
import { statusCommand } from "./commands/status.js";
import { ConflictingObsidianOptionError, ConflictingQmdOptionError, LlmWikiError } from "../core/errors.js";
import { parseHostValues } from "../core/hosts.js";
import type { CommandOptions } from "../core/types.js";

const COMMANDS = new Set(["init", "status", "qmd", "ingest", "web"]);

async function main(argv: string[]): Promise<void> {
  const { command, options } = parseCommand(argv);
  switch (command) {
    case "init":
      await initCommand(options);
      return;
    case "status":
      await statusCommand(options);
      return;
    case "qmd":
      await qmdCommand(options);
      return;
    case "ingest":
      await ingestCommand(options);
      return;
    case "web":
      await webCommand(options);
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
  if (command === "qmd") return { command, options: parseQmdOptions(args) };
  if (command === "ingest") return { command, options: parseIngestOptions(args) };
  if (command === "web") return { command, options: parseWebOptions(args) };
  if (command === "status") return { command, options: parseStatusOptions(args) };
  return { command, options: parseInitOptions(args) };
}

function parseInitOptions(args: string[]): CommandOptions {
  const options = defaults();
  const hostValues: string[] = [];
  let obsidianEnabled = false;
  let obsidianDisabled = false;
  let qmdEnabled = false;
  let qmdDisabled = false;
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
    } else if (arg === "--qmd") {
      qmdEnabled = true;
      options.qmd = true;
    } else if (arg === "--no-qmd") {
      qmdDisabled = true;
      options.qmd = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (obsidianEnabled && obsidianDisabled) throw new ConflictingObsidianOptionError();
  if (qmdEnabled && qmdDisabled) throw new ConflictingQmdOptionError();
  options.hosts = parseHostValues(hostValues);
  return options;
}

function parseStatusOptions(args: string[]): CommandOptions {
  const options = defaults();
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
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function parseQmdOptions(args: string[]): CommandOptions {
  const options = defaults();
  const action = args.shift();
  if (action !== "enable" && action !== "disable" && action !== "status" && action !== "reindex") {
    throw new Error("qmd requires one of: enable, disable, status, reindex");
  }
  options.qmdAction = action;
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
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function parseIngestOptions(args: string[]): CommandOptions {
  const options = defaults();
  const action = args.shift();
  if (action !== "plan" && action !== "status" && action !== "mark" && action !== "validate" && action !== "import-extractors") {
    throw new Error("ingest requires one of: plan, status, mark, validate, import-extractors");
  }
  options.ingestAction = action;
  options.ingestRawRoots = [];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--root") {
      const value = args.shift();
      if (!value) throw new Error("--root requires a path");
      options.root = value;
    } else if (arg === "--raw") {
      const value = args.shift();
      if (!value) throw new Error("--raw requires a path");
      options.ingestRawRoots.push(value);
    } else if (arg === "--plan") {
      const value = args.shift();
      if (!value) throw new Error("--plan requires a plan id");
      options.ingestPlanId = value;
    } else if (arg === "--source") {
      const value = args.shift();
      if (!value) throw new Error("--source requires a raw path");
      options.ingestSource = value;
    } else if (arg === "--status") {
      const value = args.shift();
      if (value !== "summarized" && value !== "merged" && value !== "skipped" && value !== "deferred") {
        throw new Error("--status requires one of: summarized, merged, skipped, deferred");
      }
      options.ingestStatus = value;
    } else if (arg === "--reason") {
      const value = args.shift();
      if (!value) throw new Error("--reason requires text");
      options.ingestReason = value;
    } else if (arg === "--file") {
      const value = args.shift();
      if (!value) throw new Error("--file requires a path");
      options.ingestFile = value;
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
  return options;
}

function parseWebOptions(args: string[]): CommandOptions {
  const options = defaults();
  const action = args.shift();
  if (action !== "build" && action !== "serve") {
    throw new Error("web requires one of: build, serve");
  }
  options.webAction = action;
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--root") {
      const value = args.shift();
      if (!value) throw new Error("--root requires a path");
      options.root = value;
    } else if (arg === "--out") {
      const value = args.shift();
      if (!value) throw new Error("--out requires a path");
      options.webOut = value;
    } else if (arg === "--port") {
      const value = args.shift();
      if (!value) throw new Error("--port requires a number");
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("--port requires a number from 0 to 65535");
      options.webPort = port;
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
  return options;
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
  llm-wiki-skills init [--root DIR] [--host codex|claude-code] [--topic ID] [--obsidian|--no-obsidian] [--qmd|--no-qmd] [--json] [--quiet]
  llm-wiki-skills status [--root DIR] [--json] [--quiet]
  llm-wiki-skills qmd enable|disable|status|reindex [--root DIR] [--json] [--quiet]
  llm-wiki-skills web build --root DIR --out DIR [--json] [--quiet]
  llm-wiki-skills web serve --root DIR [--port PORT] [--out DIR] [--json] [--quiet]  # default port: 3678
  llm-wiki-skills ingest plan [--root DIR] [--raw raw/sources] [--json] [--quiet]
  llm-wiki-skills ingest status|validate [--root DIR] [--plan PLAN_ID] [--json] [--quiet]
  llm-wiki-skills ingest mark [--root DIR] [--plan PLAN_ID] --source raw/sources/file.md --status summarized|merged|skipped|deferred [--reason TEXT] [--json] [--quiet]
  llm-wiki-skills ingest import-extractors [--root DIR] [--plan PLAN_ID] --file report.json [--json] [--quiet]

Hosts:
  codex        writes repo skills to .agents/skills
  claude-code  writes project skills to .claude/skills

Topics:
  general, study-research, work-project, product-builder, writing-content,
  trip-plan, investment, home-life, medical, legal-admin, custom

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

import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { CommandOptions } from "../../core/types.js";
import { createStarterFiles, createVaultDirectories } from "../../core/vault-contract.js";
import { renderInitReport } from "../../core/reports.js";
import { writeTextIfAbsent } from "../../core/fs.js";
import { writeGraphFiles } from "../../core/graph.js";
import { codexAgentInstructions, codexSkillContent } from "../../adapters/codex.js";
import { claudeProjectInstructions, claudeSkillContent } from "../../adapters/claude.js";
import { printResult } from "../format.js";

export async function initCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  await mkdir(root, { recursive: true });
  await createVaultDirectories(root);
  const results = await createStarterFiles(root);
  results["AGENTS.md"] = await writeTextIfAbsent(root, "AGENTS.md", codexAgentInstructions());
  results["CLAUDE.md"] = await writeTextIfAbsent(root, "CLAUDE.md", claudeProjectInstructions());
  results[".codex/skills/llm-wiki/SKILL.md"] = await writeTextIfAbsent(root, ".codex/skills/llm-wiki/SKILL.md", codexSkillContent());
  results[".claude/skills/llm-wiki/SKILL.md"] = await writeTextIfAbsent(root, ".claude/skills/llm-wiki/SKILL.md", claudeSkillContent());
  const graph = await writeGraphFiles(root);
  printResult({ root, files: results, graph }, options.json, options.quiet, renderInitReport(results));
}

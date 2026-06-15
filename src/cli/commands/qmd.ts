import path from "node:path";
import type { CommandOptions } from "../../core/types.js";
import { disableQmd, qmdStatus, reindexQmd, type QmdLifecycleResult } from "../../core/qmd.js";
import { printResult } from "../format.js";
import { enableQmdWithInstallPrompt } from "../qmd-install.js";

export async function qmdCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  switch (options.qmdAction) {
    case "enable": {
      const result = await enableQmdWithInstallPrompt(root, { optional: false, prompt: !options.json && !options.quiet, showCommands: !options.json && !options.quiet, now: fixedNow() });
      printQmdResult(result, options);
      return;
    }
    case "disable": {
      const result = await disableQmd(root);
      printQmdResult(result, options);
      return;
    }
    case "status": {
      const result = await qmdStatus(root);
      printQmdResult(result, options);
      return;
    }
    case "reindex": {
      const result = await reindexQmd(root, { showCommands: !options.json && !options.quiet, now: fixedNow() });
      printQmdResult(result, options);
      return;
    }
    default:
      throw new Error("qmd requires one of: enable, disable, status, reindex");
  }
}

function printQmdResult(result: QmdLifecycleResult, options: CommandOptions): void {
  printResult(result, options.json, options.quiet, renderQmdResult(result));
}

function renderQmdResult(result: QmdLifecycleResult): string {
  return [
    `qmd: ${result.status}`,
    `Root: ${result.root}`,
    `Collection: ${result.collection}`,
    result.searchMode ? `Search mode: ${result.searchMode}` : undefined,
    result.runtimeMode ? `Runtime mode: ${result.runtimeMode}` : undefined,
    result.fallbackReason ? `Fallback reason: ${result.fallbackReason}` : undefined,
    result.message,
    ""
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

function fixedNow(): Date | undefined {
  return process.env.LLM_WIKI_SKILLS_NOW ? new Date(process.env.LLM_WIKI_SKILLS_NOW) : undefined;
}

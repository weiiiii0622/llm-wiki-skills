import { QmdNotInstalledError } from "../core/errors.js";
import { enableQmd, type QmdLifecycleResult } from "../core/qmd.js";
import { createPromptRuntime, type PromptRuntime } from "./prompt-runtime.js";

export const QMD_INSTALL_PROMPT = "Allow to install qmd by `npm install -g @tobilu/qmd`?";

export interface PromptedQmdEnableOptions {
  installApproved?: boolean;
  now?: Date;
  optional: boolean;
  prompt: boolean;
  runtime?: PromptRuntime;
  showCommands?: boolean;
}

export async function enableQmdWithInstallPrompt(root: string, options: PromptedQmdEnableOptions): Promise<QmdLifecycleResult> {
  if (options.installApproved === false) return qmdSkipped(root);
  try {
    return await enableQmd(root, { install: options.installApproved === true, showCommands: options.showCommands, now: options.now });
  } catch (error) {
    if (!(error instanceof QmdNotInstalledError)) throw error;
    if (options.installApproved === true) throw error;
    if (!options.prompt || !canPromptForQmdInstall()) {
      if (options.optional) return qmdSkipped(root);
      throw error;
    }
    const runtime = options.runtime ?? createPromptRuntime();
    const shouldInstall = await runtime.confirm(QMD_INSTALL_PROMPT, false);
    if (!shouldInstall) return qmdSkipped(root);
    return enableQmd(root, { install: true, showCommands: options.showCommands, now: options.now });
  }
}

function qmdSkipped(root: string): QmdLifecycleResult {
  return {
    root,
    collection: "not configured",
    docsPath: "docs/llm-wiki-qmd.md",
    status: "disabled",
    message: "qmd was not enabled. Run `npx llm-wiki-skills qmd enable` when you are ready to install qmd."
  };
}

function canPromptForQmdInstall(): boolean {
  return Boolean(process.env.LLM_WIKI_SKILLS_TEST_PROMPTS) || Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

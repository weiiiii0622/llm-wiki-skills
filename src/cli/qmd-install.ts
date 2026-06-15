import { QmdNotInstalledError } from "../core/errors.js";
import { enableQmd, type QmdGpuFallbackChoice, type QmdLifecycleResult } from "../core/qmd.js";
import { createPromptRuntime, type PromptRuntime } from "./prompt-runtime.js";

export const QMD_INSTALL_PROMPT = "Allow to install qmd by `npm install -g @tobilu/qmd`?";
export const QMD_SETUP_PROMPT = "Set up qmd hybrid semantic search?";
export const QMD_SETUP_HINT = "Runs `qmd embed` and may download ~2GB of local models. CPU fallback available.";
const QMD_GPU_FALLBACK_PROMPT = "qmd semantic setup could not use GPU acceleration. Continue in CPU mode? Choose No to keep qmd full-text search only.";

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
  const runtime = options.runtime ?? (options.prompt ? createPromptRuntime() : undefined);
  const gpuFallback = buildGpuFallback(options.prompt, runtime);
  try {
    return await enableQmd(root, { gpuFallback, install: options.installApproved === true, showCommands: options.showCommands, now: options.now });
  } catch (error) {
    if (!(error instanceof QmdNotInstalledError)) throw error;
    if (options.installApproved === true) throw error;
    if (!options.prompt || !canPromptForQmdInstall()) {
      if (options.optional) return qmdSkipped(root);
      throw error;
    }
    const promptRuntime = runtime ?? createPromptRuntime();
    const shouldInstall = await promptRuntime.confirm(QMD_INSTALL_PROMPT, false);
    if (!shouldInstall) return qmdSkipped(root);
    return enableQmd(root, { gpuFallback: buildGpuFallback(options.prompt, promptRuntime), install: true, showCommands: options.showCommands, now: options.now });
  }
}

function qmdSkipped(root: string): QmdLifecycleResult {
  return {
    root,
    collection: "not configured",
    docsPath: "docs/llm-wiki-qmd.md",
    status: "disabled",
    message: "qmd was not enabled. Run `npx llm-wiki-skills qmd enable` when you are ready to install qmd and semantic models."
  };
}

function canPromptForQmdInstall(): boolean {
  return Boolean(process.env.LLM_WIKI_SKILLS_TEST_PROMPTS) || Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function buildGpuFallback(prompt: boolean, runtime: PromptRuntime | undefined): ((message: string) => Promise<QmdGpuFallbackChoice>) | undefined {
  if (!prompt || !runtime || !canPromptForQmdInstall()) return undefined;
  return async () => ((await runtime.confirm(QMD_GPU_FALLBACK_PROMPT, true)) ? "cpu" : "keyword");
}

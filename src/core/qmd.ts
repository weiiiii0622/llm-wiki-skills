import { execFile, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import {
  QmdCollectionError,
  QmdCommandError,
  QmdDoctorFailedError,
  QmdIndexUpdateError,
  QmdNotInstalledError,
  QmdRuntimeUnsupportedError
} from "./errors.js";
import { atomicWriteText, pathExists, stableJson } from "./fs.js";
import { loadManifest, MANIFEST_PATH, requiredFileRegistry } from "./manifest.js";
import { QMD_DOCS_PATH, QMD_MODEL_CACHE_PATH, QMD_MODELS, qmdCollectionName, qmdIntegrationMetadata } from "./qmd-metadata.js";
import type { Manifest, ManifestIntegrations, QmdRuntimeMode, QmdSearchMode } from "./types.js";
import { LLM_WIKI_CLI } from "./cli-command.js";

const execFileAsync = promisify(execFile);
const QMD_EMBED_MAX_DOCS_PER_BATCH = 8;
const QMD_EMBED_MAX_BATCH_MB = 8;

export interface QmdCommandResult {
  stdout: string;
  stderr: string;
}

export interface QmdRunner {
  run(command: string, args: string[], cwd: string, options?: QmdRunOptions): Promise<QmdCommandResult>;
}

export interface QmdRunOptions {
  dimOutput?: boolean;
  env?: NodeJS.ProcessEnv;
  showCommand?: boolean;
  streamOutput?: boolean;
  suppressOutput?: boolean;
}

export type QmdSemanticFailureKind = "gpu" | "model-download" | "qmd-missing" | "node-unsupported" | "generic";
export type QmdGpuFallbackChoice = "cpu" | "keyword";

export interface QmdEnableOptions {
  gpuFallback?: (message: string) => Promise<QmdGpuFallbackChoice>;
  install?: boolean;
  runner?: QmdRunner;
  showCommands?: boolean;
  now?: Date;
}

export interface QmdLifecycleResult {
  root: string;
  collection: string;
  docsPath: string;
  status: "enabled" | "disabled" | "reindexed";
  message: string;
  fallbackReason?: string;
  lastEmbeddedAt?: string;
  lastIndexedAt?: string;
  runtimeMode?: QmdRuntimeMode;
  searchMode?: QmdSearchMode;
}

export function qmdDocsContent(collection: string, searchMode: QmdSearchMode = "hybrid", runtimeMode: QmdRuntimeMode = "gpu-auto"): string {
  const command =
    searchMode === "hybrid" && runtimeMode === "cpu-forced"
      ? "QMD_FORCE_CPU=1 qmd query --json"
      : searchMode === "hybrid"
        ? "qmd query --json"
        : "qmd search --json";
  const contract =
    searchMode === "hybrid"
      ? "Use `qmd query --json` for hybrid candidate discovery. If runtime mode is CPU-forced, run it with `QMD_FORCE_CPU=1`."
      : "Use `qmd search --json` for full-text candidate discovery.";
  const modelIntro =
    searchMode === "hybrid"
      ? `qmd semantic setup downloads GGUF models on first use and caches them in \`${QMD_MODEL_CACHE_PATH}\`:`
      : `Hybrid semantic mode uses these local GGUF models when enabled. Current mode is full-text fallback, so \`qmd search --json\` does not require them:`;
  return `# LLM Wiki qmd

qmd is enabled as an optional search accelerator for this wiki.

Markdown remains the source of truth. Always read \`wiki/index.md\` first, then use qmd only to find candidate files faster.

## Commands

- Reindex after wiki changes: \`${LLM_WIKI_CLI} qmd reindex\`
- Check qmd readiness: \`${LLM_WIKI_CLI} qmd status\`
- Disable qmd metadata without deleting qmd data: \`${LLM_WIKI_CLI} qmd disable\`

## Search Contract

- Collection: \`${collection}\`
- Search mode: ${searchMode}
- Runtime mode: ${runtimeMode}
- Default agent command: \`${command}\`
- ${contract}
- Always read matching markdown files before answering or citing claims.

## Local Models

${modelIntro}

${QMD_MODELS.map((model) => `- ${model.name} (${model.purpose}, ${model.size})`).join("\n")}

Disabling qmd leaves external qmd indexes and collections untouched.
`;
}

export class ExecFileQmdRunner implements QmdRunner {
  async run(command: string, args: string[], cwd: string, options: QmdRunOptions = {}): Promise<QmdCommandResult> {
    if (options.streamOutput) return runStreaming(command, args, cwd, options);
    try {
      const result = await execFileAsync(command, args, {
        cwd,
        env: childEnv(cwd, options.env),
        shell: false,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      if (isNodeUnsupported(error)) throw new QmdRuntimeUnsupportedError();
      if (isNotFound(error)) throw new QmdNotInstalledError();
      throw new QmdCommandError(commandErrorMessage(command, args, error));
    }
  }
}

export async function enableQmd(root: string, options: QmdEnableOptions = {}): Promise<QmdLifecycleResult> {
  const resolvedRoot = path.resolve(root);
  const runner = options.runner ?? new ExecFileQmdRunner();
  if (options.install) await installQmdPackage(resolvedRoot, runner);
  const runOptions = commandDisplayOptions(options.showCommands);
  await runQmdStep(runner, resolvedRoot, ["--version"], (message) => new QmdNotInstalledError(message), "qmd", runOptions);
  await runQmdStep(runner, resolvedRoot, ["doctor"], (message) => new QmdDoctorFailedError(message), "qmd", runOptions);
  await runQmdStep(runner, resolvedRoot, ["init"], (message) => new QmdCommandError(message), "qmd", runOptions);
  const collection = qmdCollectionName(resolvedRoot);
  await addQmdCollection(runner, resolvedRoot, collection, runOptions);
  await runQmdStep(runner, resolvedRoot, ["update"], (message) => new QmdIndexUpdateError(message), "qmd", runOptions);
  const indexedAt = (options.now ?? new Date()).toISOString();
  const semantic = await runQmdEmbed(runner, resolvedRoot, collection, options, runOptions);

  await atomicWriteText(resolvedRoot, QMD_DOCS_PATH, qmdDocsContent(collection, semantic.searchMode, semantic.runtimeMode));
  await writeQmdEnabledManifest(resolvedRoot, indexedAt, semantic, collection);

  return {
    root: resolvedRoot,
    collection,
    docsPath: QMD_DOCS_PATH,
    status: "enabled",
    searchMode: semantic.searchMode,
    runtimeMode: semantic.runtimeMode,
    lastIndexedAt: indexedAt,
    ...(semantic.searchMode === "hybrid" ? { lastEmbeddedAt: indexedAt } : {}),
    ...(semantic.fallbackReason ? { fallbackReason: semantic.fallbackReason } : {}),
    message: qmdReadyMessage(semantic.searchMode, semantic.runtimeMode)
  };
}

export async function reindexQmd(root: string, options: Pick<QmdEnableOptions, "runner" | "showCommands" | "now"> = {}): Promise<QmdLifecycleResult> {
  const resolvedRoot = path.resolve(root);
  const manifest = await loadManifest(resolvedRoot);
  const qmd = manifest.integrations?.qmd;
  if (!qmd?.enabled) throw new QmdCommandError(`qmd is not enabled for this wiki. Run \`${LLM_WIKI_CLI} qmd enable\` first.`);
  const runner = options.runner ?? new ExecFileQmdRunner();
  const runOptions = commandDisplayOptions(options.showCommands);
  await runQmdStep(runner, resolvedRoot, ["update"], (message) => new QmdIndexUpdateError(message), "qmd", runOptions);
  const indexedAt = (options.now ?? new Date()).toISOString();
  const semantic = existingSemanticState(qmd);
  if (semantic.searchMode === "hybrid") {
    await runQmdStep(runner, resolvedRoot, qmdEmbedArgs(qmd.collection), (message) => new QmdCommandError(message), "qmd", {
      ...embedRunOptions(runOptions),
      ...(semantic.runtimeMode === "cpu-forced" ? { env: { QMD_FORCE_CPU: "1" } } : {})
    });
  }
  await atomicWriteText(resolvedRoot, QMD_DOCS_PATH, qmdDocsContent(qmd.collection, semantic.searchMode, semantic.runtimeMode));
  await writeQmdEnabledManifest(resolvedRoot, indexedAt, semantic, qmd.collection);
  return {
    root: resolvedRoot,
    collection: qmd.collection,
    docsPath: qmd.docsPath,
    status: "reindexed",
    searchMode: semantic.searchMode,
    runtimeMode: semantic.runtimeMode,
    lastIndexedAt: indexedAt,
    ...(semantic.searchMode === "hybrid" ? { lastEmbeddedAt: indexedAt } : {}),
    ...(semantic.fallbackReason ? { fallbackReason: semantic.fallbackReason } : {}),
    message: "qmd reindexed from markdown wiki files."
  };
}

export async function disableQmd(root: string): Promise<QmdLifecycleResult> {
  const resolvedRoot = path.resolve(root);
  const manifest = await loadManifest(resolvedRoot);
  const qmd = manifest.integrations?.qmd;
  await writeQmdDisabledManifest(resolvedRoot, manifest);
  await rm(path.join(resolvedRoot, QMD_DOCS_PATH), { force: true });
  return {
    root: resolvedRoot,
    collection: qmd?.collection ?? qmdCollectionName(resolvedRoot),
    docsPath: QMD_DOCS_PATH,
    status: "disabled",
    searchMode: qmd?.searchMode,
    runtimeMode: qmd?.schemaVersion === 2 ? qmd.runtimeMode : undefined,
    message: "qmd disabled in llm-wiki-skills metadata. External qmd indexes and collections were left untouched."
  };
}

export async function qmdStatus(root: string): Promise<QmdLifecycleResult> {
  const resolvedRoot = path.resolve(root);
  const manifest = await loadManifest(resolvedRoot);
  const qmd = manifest.integrations?.qmd;
  if (!qmd?.enabled) {
    return {
      root: resolvedRoot,
      collection: qmdCollectionName(resolvedRoot),
      docsPath: QMD_DOCS_PATH,
      status: "disabled",
      message: "qmd is not enabled for this wiki. External qmd data, if any, is not managed."
    };
  }
  return {
    root: resolvedRoot,
    collection: qmd.collection,
    docsPath: qmd.docsPath,
    status: "enabled",
    searchMode: qmd.searchMode,
    runtimeMode: qmd.schemaVersion === 2 ? qmd.runtimeMode : "keyword-fallback",
    lastIndexedAt: qmd.lastIndexedAt,
    ...(qmd.schemaVersion === 2 && qmd.lastEmbeddedAt ? { lastEmbeddedAt: qmd.lastEmbeddedAt } : {}),
    ...(qmd.schemaVersion === 2 && qmd.fallbackReason ? { fallbackReason: qmd.fallbackReason } : {}),
    message: `qmd is enabled for ${qmd.searchMode} search. Last indexed: ${qmd.lastIndexedAt ?? "unknown"}.`
  };
}

export async function installQmdPackage(root: string, runner: QmdRunner = new ExecFileQmdRunner()): Promise<void> {
  const resolvedRoot = path.resolve(root);
  await mkdir(resolvedRoot, { recursive: true });
  printInstallStart();
  await runQmdStep(runner, resolvedRoot, ["install", "-g", "@tobilu/qmd"], (message) => new QmdCommandError(message), "npm", {
    dimOutput: true,
    streamOutput: true
  });
}

export function classifyQmdSemanticFailure(message: string): QmdSemanticFailureKind {
  if (/not found|enoent|command not found|spawn qmd/i.test(message)) return "qmd-missing";
  if (/node(?:\.js)?\s*(?:>=|version|v)?\s*22|requires node/i.test(message)) return "node-unsupported";
  if (/cuda|vulkan|metal|gpu|ggml[-_](?:cuda|metal)|no gpu|backend/i.test(message)) return "gpu";
  if (/hugging\s*face|huggingface|download|network|offline|cache miss|model.+not found|eai_again|enotfound|timed out|fetch failed/i.test(message)) return "model-download";
  return "generic";
}

interface QmdSemanticState {
  fallbackReason?: string;
  runtimeMode: QmdRuntimeMode;
  searchMode: QmdSearchMode;
}

async function runQmdEmbed(runner: QmdRunner, root: string, collection: string, options: QmdEnableOptions, runOptions: QmdRunOptions): Promise<QmdSemanticState> {
  try {
    await runQmdStep(runner, root, qmdEmbedArgs(collection), (message) => new QmdCommandError(message), "qmd", embedRunOptions(runOptions));
    return { searchMode: "hybrid", runtimeMode: "gpu-auto" };
  } catch (error) {
    if (!(error instanceof QmdCommandError)) throw error;
    const kind = classifyQmdSemanticFailure(error.message);
    if (kind !== "gpu") throw error;
    const choice = options.gpuFallback ? await options.gpuFallback(error.message) : "cpu";
    if (choice === "keyword") {
      return { searchMode: "keyword", runtimeMode: "keyword-fallback", fallbackReason: error.message };
    }
    await runQmdStep(runner, root, qmdEmbedArgs(collection), (message) => new QmdCommandError(message), "qmd", {
      ...embedRunOptions(runOptions),
      env: { QMD_FORCE_CPU: "1" }
    });
    return { searchMode: "hybrid", runtimeMode: "cpu-forced" };
  }
}

function qmdEmbedArgs(collection: string): string[] {
  return [
    "embed",
    "-c",
    collection,
    "--max-docs-per-batch",
    String(QMD_EMBED_MAX_DOCS_PER_BATCH),
    "--max-batch-mb",
    String(QMD_EMBED_MAX_BATCH_MB)
  ];
}

function embedRunOptions(options: QmdRunOptions): QmdRunOptions {
  return {
    ...options,
    dimOutput: true,
    streamOutput: true,
    suppressOutput: !options.showCommand
  };
}

function existingSemanticState(qmd: NonNullable<ManifestIntegrations["qmd"]>): QmdSemanticState {
  if (qmd.schemaVersion === 1) {
    return { searchMode: "hybrid", runtimeMode: "gpu-auto" };
  }
  return {
    searchMode: qmd.searchMode,
    runtimeMode: qmd.runtimeMode,
    ...(qmd.fallbackReason ? { fallbackReason: qmd.fallbackReason } : {})
  };
}

function qmdReadyMessage(searchMode: QmdSearchMode, runtimeMode: QmdRuntimeMode): string {
  if (searchMode === "keyword") return "qmd enabled in full-text fallback mode. Markdown remains the source of truth; qmd search is used for candidate discovery.";
  if (runtimeMode === "cpu-forced") return "qmd enabled for hybrid semantic search in CPU mode. Markdown remains the source of truth.";
  return "qmd enabled for hybrid semantic search. Markdown remains the source of truth.";
}

async function addQmdCollection(runner: QmdRunner, root: string, collection: string, options: QmdRunOptions = {}): Promise<void> {
  try {
    await runQmdStep(runner, root, ["collection", "add", path.join(root, "wiki"), "--name", collection], (message) => new QmdCollectionError(message), "qmd", options);
  } catch (error) {
    if (error instanceof QmdCollectionError && /collection .+ already exists/i.test(error.message)) return;
    throw error;
  }
}

async function runQmdStep(
  runner: QmdRunner,
  root: string,
  args: string[],
  mapError: (message: string) => Error,
  command = "qmd",
  options: QmdRunOptions = {}
): Promise<void> {
  try {
    if (options.showCommand) printCommandStart(command, args);
    await runner.run(command, args, root, options);
  } catch (error) {
    if (error instanceof QmdNotInstalledError || error instanceof QmdRuntimeUnsupportedError) throw error;
    if (error instanceof QmdCommandError) throw mapError(error.message);
    throw error;
  }
}

function runStreaming(command: string, args: string[], cwd: string, options: QmdRunOptions): Promise<QmdCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: childEnv(cwd, options.env),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (!options.suppressOutput) writeStreamingOutput(process.stdout, chunk, options);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (!options.suppressOutput) writeStreamingOutput(process.stderr, chunk, options);
    });
    child.on("error", (error) => {
      if (isNodeUnsupported(error)) reject(new QmdRuntimeUnsupportedError());
      else if (isNotFound(error)) reject(new QmdNotInstalledError());
      else reject(new QmdCommandError(commandErrorMessage(command, args, error)));
    });
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve({ stdout, stderr });
      else reject(new QmdCommandError(`${command} ${args.join(" ")} failed${stderr.trim() ? `: ${stderr.trim()}` : "."}`));
    });
  });
}

function commandDisplayOptions(showCommands: boolean | undefined): QmdRunOptions {
  return showCommands ? { showCommand: true } : {};
}

function childEnv(cwd: string, env: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, ...env, PWD: childPwd(cwd) };
}

function childPwd(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return path.resolve(cwd);
  }
}

function printCommandStart(command: string, args: string[]): void {
  writeDimmedOutput(process.stdout, `Running \`${formatCommand(command, args)}\`...\n`);
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args.map(formatCommandArg)].join(" ");
}

function formatCommandArg(arg: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

function printInstallStart(): void {
  const line = "Running `npm install -g @tobilu/qmd`...\n";
  writeDimmedOutput(process.stdout, line);
}

function writeStreamingOutput(stream: NodeJS.WriteStream, chunk: string, options: QmdRunOptions): void {
  if (options.dimOutput) {
    writeDimmedOutput(stream, chunk);
    return;
  }
  stream.write(chunk);
}

function writeDimmedOutput(stream: NodeJS.WriteStream, value: string): void {
  stream.write(stream.isTTY ? `\x1b[2m${value}\x1b[22m` : value);
}

async function writeQmdEnabledManifest(root: string, indexedAt: string, semantic: QmdSemanticState, collection: string): Promise<void> {
  const manifest = await loadManifest(root);
  const integrations = { ...manifest.integrations, qmd: qmdIntegrationMetadata(root, { collection, indexedAt, ...semantic }) };
  await writeManifestWithIntegrations(root, manifest, integrations);
}

async function writeQmdDisabledManifest(root: string, manifest: Manifest): Promise<void> {
  const integrations = { ...manifest.integrations };
  delete integrations.qmd;
  await writeManifestWithIntegrations(root, manifest, Object.keys(integrations).length > 0 ? integrations : undefined);
}

async function writeManifestWithIntegrations(root: string, manifest: Manifest, integrations: ManifestIntegrations | undefined): Promise<void> {
  const next: Manifest = {
    ...manifest,
    integrations,
    files: requiredFileRegistry(manifest.hosts, integrations)
  };
  if (!integrations) delete next.integrations;
  await mkdir(root, { recursive: true });
  await atomicWriteText(root, MANIFEST_PATH, stableJson(next));
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

function isNodeUnsupported(error: unknown): boolean {
  const message = commandErrorText(error);
  return /node(?:\.js)?\s*(?:>=|version|v)?\s*22|requires node/i.test(message);
}

function commandErrorMessage(command: string, args: string[], error: unknown): string {
  const text = commandErrorText(error);
  return `${command} ${args.join(" ")} failed${text ? `: ${text}` : "."}`;
}

function commandErrorText(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
    if (typeof record.stderr === "string" && record.stderr.trim()) return record.stderr.trim();
    if (typeof record.stdout === "string" && record.stdout.trim()) return record.stdout.trim();
    if (typeof record.message === "string") return record.message;
  }
  return String(error);
}

export async function qmdDocsExist(root: string): Promise<boolean> {
  return pathExists(path.join(root, QMD_DOCS_PATH));
}

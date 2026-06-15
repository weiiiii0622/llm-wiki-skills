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
import { QMD_DOCS_PATH, qmdCollectionName, qmdIntegrationMetadata } from "./qmd-metadata.js";
import type { Manifest, ManifestIntegrations } from "./types.js";

const execFileAsync = promisify(execFile);

export interface QmdCommandResult {
  stdout: string;
  stderr: string;
}

export interface QmdRunner {
  run(command: string, args: string[], cwd: string, options?: QmdRunOptions): Promise<QmdCommandResult>;
}

export interface QmdRunOptions {
  dimOutput?: boolean;
  showCommand?: boolean;
  streamOutput?: boolean;
}

export interface QmdEnableOptions {
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
}

export function qmdDocsContent(collection: string): string {
  return `# LLM Wiki qmd

qmd is enabled as an optional search accelerator for this wiki.

Markdown remains the source of truth. Always read \`wiki/index.md\` first, then use qmd only to find candidate files faster.

## Commands

- Reindex after wiki changes: \`llm-wiki-skills qmd reindex\`
- Check qmd readiness: \`llm-wiki-skills qmd status\`
- Disable qmd metadata without deleting qmd data: \`llm-wiki-skills qmd disable\`

## Search Contract

- Collection: \`${collection}\`
- Search mode: keyword
- Use \`qmd search --json\` for candidate discovery.
- Do not rely on embeddings or semantic qmd query behavior for this wiki.

Disabling qmd leaves external qmd indexes and collections untouched.
`;
}

export class ExecFileQmdRunner implements QmdRunner {
  async run(command: string, args: string[], cwd: string, options: QmdRunOptions = {}): Promise<QmdCommandResult> {
    if (options.streamOutput) return runStreaming(command, args, cwd, options);
    try {
      const result = await execFileAsync(command, args, {
        cwd,
        env: childEnv(cwd),
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
  await atomicWriteText(resolvedRoot, QMD_DOCS_PATH, qmdDocsContent(collection));
  await writeQmdEnabledManifest(resolvedRoot, indexedAt);

  return {
    root: resolvedRoot,
    collection,
    docsPath: QMD_DOCS_PATH,
    status: "enabled",
    message: "qmd enabled. Markdown remains the source of truth; qmd is used for keyword candidate discovery."
  };
}

export async function reindexQmd(root: string, options: Pick<QmdEnableOptions, "runner" | "showCommands" | "now"> = {}): Promise<QmdLifecycleResult> {
  const resolvedRoot = path.resolve(root);
  const manifest = await loadManifest(resolvedRoot);
  const qmd = manifest.integrations?.qmd;
  if (!qmd?.enabled) throw new QmdCommandError("qmd is not enabled for this wiki. Run `llm-wiki-skills qmd enable` first.");
  const runner = options.runner ?? new ExecFileQmdRunner();
  await runQmdStep(runner, resolvedRoot, ["update"], (message) => new QmdIndexUpdateError(message), "qmd", commandDisplayOptions(options.showCommands));
  const indexedAt = (options.now ?? new Date()).toISOString();
  await writeQmdEnabledManifest(resolvedRoot, indexedAt);
  return {
    root: resolvedRoot,
    collection: qmd.collection,
    docsPath: qmd.docsPath,
    status: "reindexed",
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
    message: `qmd is enabled for keyword search. Last indexed: ${qmd.lastIndexedAt ?? "unknown"}.`
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
      env: childEnv(cwd),
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
      writeStreamingOutput(process.stdout, chunk, options);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      writeStreamingOutput(process.stderr, chunk, options);
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

function childEnv(cwd: string): NodeJS.ProcessEnv {
  return { ...process.env, PWD: childPwd(cwd) };
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

async function writeQmdEnabledManifest(root: string, indexedAt: string): Promise<void> {
  const manifest = await loadManifest(root);
  const integrations = { ...manifest.integrations, qmd: qmdIntegrationMetadata(root, indexedAt) };
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

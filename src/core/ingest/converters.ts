import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathExists } from "../fs.js";
import { toPosixPath } from "../path-guard.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_CONVERSION_TIMEOUT_MS = 600_000;
export const DEFAULT_CONVERSION_MAX_MB = 100;
export const MARKER_MANAGED_VENV_ENV = "LLM_WIKI_MARKER_VENV";
export const MARKER_SETUP_HINT = "Install Marker outside this package, or rerun init and approve the managed Python virtual environment setup.";

const MARKER_COMMANDS = ["marker_single", "marker"] as const;
const MARKER_CONVERTED_ROOT = ".llm-wiki-skills/ingest-plans";
const LEGACY_MARKER_CONVERTED_ROOT = "wiki/ingest-plans";
const MARKER_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".xls",
  ".html",
  ".htm",
  ".epub",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp"
]);

export type ConversionStatus =
  | "not-needed"
  | "converted"
  | "asset-only"
  | "missing-tool"
  | "disabled"
  | "timeout"
  | "failed"
  | "missing-output"
  | "unsupported"
  | "unsafe-output"
  | "oversized";

export interface ConversionFields {
  conversionStatus: ConversionStatus;
  convertedMarkdownPath?: string;
  convertedAssetPaths?: string[];
  converterName?: "marker";
  converterCommand?: string;
  conversionError?: string;
}

export interface ConverterStatus {
  name: "marker";
  available: boolean;
  command?: string;
  setupHint: string;
}

export interface ConversionOptions {
  enabled: boolean;
  converter: "marker";
  timeoutMs: number;
  maxMb: number;
  workers: number;
  log?: (chunk: string) => void;
}

export interface ConversionSourceInput {
  id: string;
  rawPath: string;
  extension: string;
  sizeBytes: number;
}

export interface ConvertSourceContext {
  root: string;
  planId: string;
  source: ConversionSourceInput;
  options: ConversionOptions;
  markerStatus?: ConverterStatus;
}

export function defaultConversionOptions(overrides: Partial<ConversionOptions> = {}): ConversionOptions {
  return {
    enabled: true,
    converter: "marker",
    timeoutMs: DEFAULT_CONVERSION_TIMEOUT_MS,
    maxMb: DEFAULT_CONVERSION_MAX_MB,
    workers: 1,
    ...overrides
  };
}

export function isMarkerConvertibleExtension(extension: string): boolean {
  return MARKER_EXTENSIONS.has(extension.toLowerCase());
}

export function markerConvertedDir(planId: string): string {
  return `${MARKER_CONVERTED_ROOT}/${planId}/converted`;
}

export async function markerProviderStatus(): Promise<ConverterStatus> {
  for (const command of markerCommandCandidates()) {
    const exists = await commandExists(command);
    if (exists) {
      return { name: "marker", available: true, command, setupHint: MARKER_SETUP_HINT };
    }
  }
  return { name: "marker", available: false, setupHint: MARKER_SETUP_HINT };
}

export function markerManagedVenvPath(env: NodeJS.ProcessEnv = process.env): string {
  return env[MARKER_MANAGED_VENV_ENV] ? path.resolve(env[MARKER_MANAGED_VENV_ENV]) : path.join(os.homedir(), ".llm-wiki-skills", "marker-venv");
}

export function markerManagedPythonPath(venvPath = markerManagedVenvPath()): string {
  return process.platform === "win32" ? path.join(venvPath, "Scripts", "python.exe") : path.join(venvPath, "bin", "python");
}

function markerCommandCandidates(): string[] {
  const venv = markerManagedVenvPath();
  return [...MARKER_COMMANDS.map((command) => markerVenvCommandPath(venv, command)), ...MARKER_COMMANDS];
}

function markerVenvCommandPath(venvPath: string, command: string): string {
  const executable = process.platform === "win32" ? `${command}.exe` : command;
  return process.platform === "win32" ? path.join(venvPath, "Scripts", executable) : path.join(venvPath, "bin", executable);
}

export async function convertSourceWithMarker(context: ConvertSourceContext): Promise<ConversionFields> {
  const { root, planId, source, options } = context;
  if (source.extension === ".md" || source.extension === ".markdown" || source.extension === ".txt" || source.extension === ".text") {
    return { conversionStatus: "not-needed" };
  }
  if (!isMarkerConvertibleExtension(source.extension)) {
    return {
      conversionStatus: "unsupported",
      converterName: "marker",
      conversionError: `Marker conversion is not supported for ${source.extension || "extensionless"} files.`
    };
  }
  if (!options.enabled) {
    return {
      conversionStatus: "disabled",
      converterName: "marker",
      conversionError: "Conversion was disabled with --no-convert."
    };
  }
  const maxBytes = options.maxMb * 1024 * 1024;
  if (source.sizeBytes > maxBytes) {
    return {
      conversionStatus: "oversized",
      converterName: "marker",
      conversionError: `${source.rawPath} is ${source.sizeBytes} bytes, above the ${options.maxMb} MB conversion limit.`
    };
  }
  const status = context.markerStatus ?? (await markerProviderStatus());
  if (!status.available || !status.command) {
    return {
      conversionStatus: "missing-tool",
      converterName: "marker",
      conversionError: MARKER_SETUP_HINT
    };
  }

  const planConvertedDir = markerConvertedDir(planId);
  const sourceOutputRelative = `${planConvertedDir}/${source.id}-${safeOutputSlug(source.rawPath)}`;
  const sourceOutputAbsolute = path.join(root, sourceOutputRelative);
  await mkdir(sourceOutputAbsolute, { recursive: true });
  const args = [path.join(root, source.rawPath), "--output_dir", sourceOutputAbsolute];
  const converterCommand = `${status.command} ${args.map(formatCommandArg).join(" ")}`;
  try {
    options.log?.(`→ ${converterCommand}\n`);
    await runStreamingCommand(status.command, args, {
      cwd: root,
      timeout: options.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      log: options.log
    });
  } catch (error) {
    const failure = normalizeExecFailure(error);
    if (failure.timedOut) {
      return {
        conversionStatus: "timeout",
        converterName: "marker",
        converterCommand,
        conversionError: `Marker timed out after ${options.timeoutMs} ms for ${source.rawPath}. Rerun with --conversion-timeout-ms to allow more time.`
      };
    }
    return {
      conversionStatus: "failed",
      converterName: "marker",
      converterCommand,
      conversionError: failure.message
    };
  }

  const collected = await collectConvertedOutputs(root, planConvertedDir, sourceOutputAbsolute);
  if (collected.unsafe.length > 0) {
    return {
      conversionStatus: "unsafe-output",
      converterName: "marker",
      converterCommand,
      conversionError: `Marker produced unsafe output paths: ${collected.unsafe.join(", ")}`
    };
  }

  const markdown = collected.markdown[0];
  if (!markdown) {
    return {
      conversionStatus: "missing-output",
      converterName: "marker",
      converterCommand,
      convertedAssetPaths: collected.assets,
      conversionError: `Marker did not produce markdown for ${source.rawPath}.`
    };
  }
  const body = await readFile(path.join(root, markdown), "utf8").catch(() => "");
  if (body.trim().length === 0) {
    return {
      conversionStatus: "missing-output",
      converterName: "marker",
      converterCommand,
      convertedMarkdownPath: markdown,
      convertedAssetPaths: collected.assets,
      conversionError: `Marker produced empty markdown for ${source.rawPath}.`
    };
  }
  return {
    conversionStatus: "converted",
    convertedMarkdownPath: markdown,
    convertedAssetPaths: collected.assets,
    converterName: "marker",
    converterCommand
  };
}

export function conversionPathIsInsideConvertedDir(root: string, planId: string, relativePath: string): boolean {
  const targetAbsolute = path.resolve(root, relativePath);
  return [`${MARKER_CONVERTED_ROOT}/${planId}/converted`, `${LEGACY_MARKER_CONVERTED_ROOT}/${planId}/converted`].some((convertedDir) => {
    const relative = path.relative(path.resolve(root, convertedDir), targetAbsolute);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ["--help"], { timeout: 5_000, maxBuffer: 1024 * 1024 });
    return true;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException;
    return failure.code !== "ENOENT";
  }
}

function runStreamingCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number; log?: (chunk: string) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    let lastLogged = "";
    const appendOutput = (current: string, chunk: string): string => {
      if (current.length >= options.maxBuffer) return current;
      return `${current}${chunk}`.slice(0, options.maxBuffer);
    };
    const logChunk = (chunk: string): void => {
      if (!chunk) return;
      lastLogged = chunk;
      options.log?.(chunk);
    };
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, options.timeout);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = appendOutput(stdout, chunk);
      logChunk(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = appendOutput(stderr, chunk);
      logChunk(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (options.log && lastLogged && !lastLogged.endsWith("\n")) {
        options.log("\n");
      }
      if (code === 0 && !killed) {
        resolve();
        return;
      }
      reject(Object.assign(new Error(`Command failed: ${command}`), { code: code ?? undefined, signal: signal ?? undefined, killed, stdout, stderr }));
    });
  });
}

async function collectConvertedOutputs(root: string, planConvertedDir: string, outputAbsolute: string): Promise<{ markdown: string[]; assets: string[]; unsafe: string[] }> {
  const markdown: string[] = [];
  const assets: string[] = [];
  const unsafe: string[] = [];
  await walkOutput(outputAbsolute, async (absolute) => {
    const relative = toPosixPath(path.relative(root, absolute));
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) {
      unsafe.push(relative);
      return;
    }
    if (!isInside(path.resolve(root, planConvertedDir), absolute)) {
      unsafe.push(relative);
      return;
    }
    if (path.extname(absolute).toLowerCase() === ".md") {
      markdown.push(relative);
    } else {
      assets.push(relative);
    }
  });
  markdown.sort();
  assets.sort();
  return { markdown, assets, unsafe };
}

async function walkOutput(current: string, onFile: (absolute: string) => Promise<void>): Promise<void> {
  if (!(await pathExists(current))) return;
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkOutput(absolute, onFile);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      await onFile(absolute);
    }
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeOutputSlug(rawPath: string): string {
  const slug = rawPath
    .replace(/\.[^/.]+$/, "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return Array.from(slug || "source").slice(0, 80).join("").replace(/-+$/g, "") || "source";
}

function formatCommandArg(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function normalizeExecFailure(error: unknown): { timedOut: boolean; message: string } {
  const candidate = error as { signal?: string; killed?: boolean; code?: string | number; stderr?: string; stdout?: string; message?: string };
  const message = [candidate.stderr, candidate.stdout, candidate.message].filter(Boolean).join("\n").trim() || "Marker conversion failed.";
  return {
    timedOut: candidate.signal === "SIGTERM" || candidate.killed === true,
    message
  };
}

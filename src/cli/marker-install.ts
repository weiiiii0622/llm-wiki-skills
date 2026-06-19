import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { markerManagedPythonPath, markerManagedVenvPath, markerProviderStatus, type ConverterStatus } from "../core/ingest/converters.js";
import type { PromptRuntime } from "./prompt-runtime.js";

export const MARKER_INSTALL_PROMPT = "Allow to install Marker in a managed Python virtual environment?";
export const MARKER_INSTALL_HINT =
  "Enables PDF/DOCX/PPTX/image conversion during ingest. Runs `python3 -m venv` and installs `marker-pdf[full]` inside that venv.";

export type MarkerSetupStatus = "available" | "installed" | "missing";

export interface MarkerSetupResult {
  status: MarkerSetupStatus;
  command?: string;
  message: string;
}

export async function setupMarkerWithInstallPrompt(root: string, runtime: PromptRuntime): Promise<MarkerSetupResult> {
  const status = await markerProviderStatus();
  if (status.available) return markerAvailable(status);
  const shouldInstall = await runtime.confirm(MARKER_INSTALL_PROMPT, false, MARKER_INSTALL_HINT);
  if (!shouldInstall) return markerMissing();
  await installMarkerPackage(root);
  return {
    status: "installed",
    message: "installed during setup"
  };
}

export async function installMarkerPackage(root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  await mkdir(resolvedRoot, { recursive: true });
  const venvPath = markerManagedVenvPath();
  const pythonPath = markerManagedPythonPath(venvPath);
  await mkdir(path.dirname(venvPath), { recursive: true });
  printCommandStart("python3", ["-m", "venv", venvPath]);
  await runStreaming("python3", ["-m", "venv", venvPath], resolvedRoot);
  printCommandStart(pythonPath, ["-m", "pip", "install", "marker-pdf[full]"]);
  await runStreaming(pythonPath, ["-m", "pip", "install", "marker-pdf[full]"], resolvedRoot);
}

function markerAvailable(status: ConverterStatus): MarkerSetupResult {
  return {
    status: "available",
    command: status.command,
    message: status.command ? `available (${status.command})` : "available"
  };
}

function markerMissing(): MarkerSetupResult {
  return {
    status: "missing",
    message: "not installed"
  };
}

function runStreaming(command: string, args: string[], cwd: string): Promise<void> {
  const displayCommand = [command, ...args].map(formatCommandArg).join(" ");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, PWD: childPwd(cwd) },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => writeDimmedOutput(process.stdout, chunk));
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      writeDimmedOutput(process.stderr, chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`${displayCommand} failed${stderr.trim() ? `: ${stderr.trim()}` : "."}`));
    });
  });
}

function childPwd(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return path.resolve(cwd);
  }
}

function printCommandStart(command: string, args: string[]): void {
  writeDimmedOutput(process.stdout, `Running \`${[command, ...args].map(formatCommandArg).join(" ")}\`...\n`);
}

function formatCommandArg(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function writeDimmedOutput(stream: NodeJS.WriteStream, value: string): void {
  stream.write(stream.isTTY ? `\x1b[2m${value}\x1b[22m` : value);
}

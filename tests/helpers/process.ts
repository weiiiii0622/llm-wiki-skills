import { spawn } from "node:child_process";

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function execaNode(args: string[], env: Record<string, string> = {}, reject = true): Promise<ProcessResult> {
  return new Promise((resolve, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      const result = { exitCode, stdout, stderr };
      if (reject && exitCode !== 0) {
        rejectPromise(new Error(`Command failed (${exitCode}): ${stderr || stdout}`));
      } else {
        resolve(result);
      }
    });
  });
}

import { chmod, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecFileQmdRunner, installQmdPackage, type QmdRunner } from "../src/core/qmd.js";

describe("qmd runner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dims streamed install output on tty while preserving captured command output", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-qmd-runner-"));
    const command = path.join(root, "fake-install");
    await writeFile(
      command,
      `#!/bin/sh
echo "added 264 packages in 10s"
echo "npm warn deprecated prebuild-install@7.1.3: No longer maintained." >&2
exit 0
`,
      "utf8"
    );
    await chmod(command, 0o755);

    const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    const stderrTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
    let streamedStdout = "";
    let streamedStderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      streamedStdout += chunk.toString();
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      streamedStderr += chunk.toString();
      return true;
    });

    try {
      const result = await new ExecFileQmdRunner().run(command, [], root, { dimOutput: true, streamOutput: true });

      expect(result.stdout).toBe("added 264 packages in 10s\n");
      expect(result.stderr).toBe("npm warn deprecated prebuild-install@7.1.3: No longer maintained.\n");
      expect(streamedStdout).toBe("\x1b[2madded 264 packages in 10s\n\x1b[22m");
      expect(streamedStderr).toBe("\x1b[2mnpm warn deprecated prebuild-install@7.1.3: No longer maintained.\n\x1b[22m");
    } finally {
      restoreTTY(process.stdout, stdoutTTY);
      restoreTTY(process.stderr, stderrTTY);
    }
  });

  it("runs qmd installation from the target wiki root", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-qmd-install-root-"));
    const root = path.join(parent, "wiki-root");
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const runner: QmdRunner = {
      async run(command, args, cwd) {
        calls.push({ command, args, cwd });
        return { stdout: "", stderr: "" };
      }
    };
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await installQmdPackage(root, runner);

    expect((await stat(root)).isDirectory()).toBe(true);
    expect(calls).toEqual([
      {
        command: "npm",
        args: ["install", "-g", "@tobilu/qmd"],
        cwd: root
      }
    ]);
  });

  it("sets PWD to the target cwd for qmd node subprocesses", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-qmd-pwd-"));
    const root = path.join(parent, "wiki-root");
    const command = path.join(parent, "fake-qmd");
    await mkdir(root, { recursive: true });
    await writeFile(
      command,
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const pwd = process.env.PWD || process.cwd();
fs.mkdirSync(path.join(pwd, ".qmd"), { recursive: true });
`,
      "utf8"
    );
    await chmod(command, 0o755);

    await new ExecFileQmdRunner().run(command, ["init"], root);

    expect((await stat(path.join(root, ".qmd"))).isDirectory()).toBe(true);
  });
});

function restoreTTY(stream: NodeJS.WriteStream, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(stream, "isTTY", descriptor);
  } else {
    delete (stream as Partial<NodeJS.WriteStream>).isTTY;
  }
}

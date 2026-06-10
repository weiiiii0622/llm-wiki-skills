import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ImmutableRawViolationError, WriteConflictError } from "../src/core/errors.js";
import { assertInsideRoot, ensureSafeWritePath } from "../src/core/path-guard.js";

describe("path guard", () => {
  it("rejects traversal outside the vault", () => {
    expect(() => assertInsideRoot("/tmp/vault", "../outside.md")).toThrow(WriteConflictError);
  });

  it("rejects raw mutations by default", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-"));
    await expect(ensureSafeWritePath(root, "raw/source.md")).rejects.toThrow(ImmutableRawViolationError);
  });

  it("rejects symlink write targets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-outside-"));
    await mkdir(path.join(root, "wiki"), { recursive: true });
    await symlink(outside, path.join(root, "wiki/link"));
    await expect(ensureSafeWritePath(root, "wiki/link/page.md")).rejects.toThrow(WriteConflictError);
  });
});

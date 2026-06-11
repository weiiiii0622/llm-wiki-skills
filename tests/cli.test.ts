import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execaNode } from "./helpers/process.js";
import { describe, expect, it } from "vitest";

describe("cli", () => {
  it("init --host codex generates Codex assets only", async () => {
    const root = await tempRoot("llm-wiki-codex-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());

    await expect(readFile(path.join(root, ".codex/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
    await expect(readFile(path.join(root, ".codex/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");
    await expect(readFile(path.join(root, ".codex/skills/llm-wiki-lint/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Lint");
    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-ingest/SKILL.md"), "utf8")).rejects.toThrow();

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.hosts).toEqual(["codex"]);
  });

  it("init --host claude-code generates Claude assets only", async () => {
    const root = await tempRoot("llm-wiki-claude-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "claude-code", "--quiet"], fixedEnv());

    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
    await expect(readFile(path.join(root, ".codex/skills/llm-wiki-ingest/SKILL.md"), "utf8")).rejects.toThrow();

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.hosts).toEqual(["claude-code"]);
  });

  it("repeated and comma --host values generate both hosts", async () => {
    const root = await tempRoot("llm-wiki-both-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex,claude-code", "--host", "codex", "--quiet"], fixedEnv());

    await expect(readFile(path.join(root, ".codex/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");
    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.hosts).toEqual(["claude-code", "codex"]);
  });

  it("non-TTY init without host returns HostRequiredError", async () => {
    const root = await tempRoot("llm-wiki-host-required-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(10);
    expect(result.stderr).toContain("HostRequiredError");
  });

  it("unknown host returns InvalidHostError", async () => {
    const root = await tempRoot("llm-wiki-invalid-host-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "unknown"], fixedEnv(), false);
    expect(result.exitCode).toBe(9);
    expect(result.stderr).toContain("InvalidHostError");
  });

  it("does not keep deprecated public command aliases", async () => {
    const result = await execaNode(["dist/cli/index.js", "health"], fixedEnv(), false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("llm-wiki-skills status");
    expect(result.stdout).not.toContain("llm-wiki-skills health");
  });

  it("generated assets include required sections without retired CLI instructions", async () => {
    const root = await tempRoot("llm-wiki-assets-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex,claude-code", "--quiet"], fixedEnv());

    const files = [
      "docs/llm-wiki-contract.md",
      "docs/llm-wiki-workflows.md",
      ".codex/skills/llm-wiki-ingest/SKILL.md",
      ".codex/skills/llm-wiki-query/SKILL.md",
      ".codex/skills/llm-wiki-lint/SKILL.md",
      ".claude/skills/llm-wiki-ingest/SKILL.md",
      ".claude/skills/llm-wiki-query/SKILL.md",
      ".claude/skills/llm-wiki-lint/SKILL.md"
    ];
    const combined = (await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")))).join("\n");
    expect(combined).toContain("## Workflow");
    expect(combined).toContain("## Contract");
    expect(combined).toContain("persistent, compounding artifact");
    expect(combined).toContain("Contradictions");
    expect(combined).toContain("Orphan pages");
    expect(combined).toContain("Data gaps");
    expect(combined).toContain("new questions or sources worth investigating");
    expect(combined).not.toContain("llm-wiki-skills graph");
    expect(combined).not.toContain("llm-wiki-skills lint");
    expect(combined).not.toContain("Review changed files");
  });

  it("status --json passes after init", async () => {
    const root = await tempRoot("llm-wiki-status-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    expect(JSON.parse(status.stdout)).toMatchObject({ status: "pass", hosts: ["codex"] });
  });

  it("status fails for missing manifest", async () => {
    const root = await tempRoot("llm-wiki-no-manifest-");
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain("RequiredFileMissingError");
  });

  it("status fails for invalid manifest JSON", async () => {
    const root = await tempRoot("llm-wiki-bad-json-");
    await writeFile(path.join(root, ".llm-wiki-skills.json"), "{", "utf8");
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(13);
    expect(result.stderr).toContain("ManifestMismatchError");
  });

  it("status fails for a missing shared reference", async () => {
    const root = await tempRoot("llm-wiki-missing-ref-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await rm(path.join(root, "docs/llm-wiki-contract.md"));
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain("RequiredFileMissingError");
  });

  it("status fails for a missing host skill", async () => {
    const root = await tempRoot("llm-wiki-missing-skill-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "claude-code", "--quiet"], fixedEnv());
    await rm(path.join(root, ".claude/skills/llm-wiki-query/SKILL.md"));
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain("RequiredFileMissingError");
  });

  it("status fails for manifest/files mismatch", async () => {
    const root = await tempRoot("llm-wiki-mismatch-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    const manifestPath = path.join(root, ".llm-wiki-skills.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files = manifest.files.filter((file: string) => file !== ".codex/skills/llm-wiki-lint/SKILL.md");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(13);
    expect(result.stderr).toContain("ManifestMismatchError");
  });

  it("rerun init does not overwrite existing user-edited files", async () => {
    const root = await tempRoot("llm-wiki-existing-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await writeFile(path.join(root, "wiki/overview.md"), "custom overview\n", "utf8");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await expect(readFile(path.join(root, "wiki/overview.md"), "utf8")).resolves.toBe("custom overview\n");
  });
});

function fixedEnv(): Record<string, string> {
  return { LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z" };
}

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

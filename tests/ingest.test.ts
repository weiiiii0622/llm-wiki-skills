import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execaNode } from "./helpers/process.js";
import { describe, expect, it } from "vitest";

describe("ingest cli", () => {
  it("plans nested raw files with stable sidecar and summary paths", async () => {
    const root = await initializedVault("llm-wiki-ingest-plan-");
    await mkdir(path.join(root, "raw/sources/team"), { recursive: true });
    await writeFile(path.join(root, "raw/sources/team/alpha.md"), "Alpha\n", "utf8");
    await writeFile(path.join(root, "raw/notes/beta.txt"), "Beta\n", "utf8");

    const result = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv());
    const output = JSON.parse(result.stdout);

    expect(output.plan.planId).toBe("ingest-20260610-000000");
    expect(output.plan.summaryCounts).toMatchObject({ discovered: 2, planned: 2, validationFailures: 0 });
    expect(output.plan.sources.map((source: { rawPath: string }) => source.rawPath)).toEqual(["raw/notes/beta.txt", "raw/sources/team/alpha.md"]);
    expect(output.plan.sources.map((source: { expectedSummaryPath: string }) => source.expectedSummaryPath)).toEqual([
      "wiki/sources/notes-beta.md",
      "wiki/sources/sources-team-alpha.md"
    ]);
    await expect(readFile(path.join(root, "wiki/ingest-plans/ingest-20260610-000000.json"), "utf8")).resolves.toContain('"planStatus": "active"');
    await expect(readFile(path.join(root, "wiki/ingest-plans/ingest-20260610-000000.md"), "utf8")).resolves.toContain("## Batches");
  });

  it("preserves Chinese raw titles in summary paths", async () => {
    const root = await initializedVault("llm-wiki-ingest-chinese-");
    await writeFile(path.join(root, "raw/notes/產品研究.md"), "# 產品研究\n\n中文內容。\n", "utf8");
    await writeFile(path.join(root, "raw/notes/產品 研究.md"), "# 產品 研究\n\n更多中文內容。\n", "utf8");
    await writeFile(path.join(root, "raw/notes/全中文.md"), "# 全中文\n\n內容。\n", "utf8");

    const result = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv());
    const output = JSON.parse(result.stdout);
    const paths = output.plan.sources.map((source: { expectedSummaryPath: string }) => source.expectedSummaryPath);

    expect(paths).toContain("wiki/sources/notes-全中文.md");
    expect(paths).toContain("wiki/sources/notes-產品研究.md");
    expect(paths).toContain("wiki/sources/notes-產品-研究.md");
    expect(paths.every((summaryPath: string) => !new RegExp("^wiki/sources/notes-[0-9a-f]{8}\\.md$").test(summaryPath))).toBe(true);
  });

  it("rejects raw roots outside raw and symlinked raw files", async () => {
    const root = await initializedVault("llm-wiki-ingest-safe-");
    const outside = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--raw", "wiki"], fixedEnv(), false);
    expect(outside.exitCode).toBe(27);
    expect(outside.stderr).toContain("Raw root must be inside raw/");

    await writeFile(path.join(root, "raw/sources/real.md"), "Real\n", "utf8");
    await symlink(path.join(root, "raw/sources/real.md"), path.join(root, "raw/sources/link.md"));
    const linked = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root], fixedEnv(), false);
    expect(linked.exitCode).toBe(27);
    expect(linked.stderr).toContain("Refusing to scan symlinked raw path");
  });

  it("enforces mark transitions and validates the completed ingest plan", async () => {
    const root = await initializedVault("llm-wiki-ingest-lifecycle-");
    await writeFile(path.join(root, "raw/sources/source.md"), "Source claim\n", "utf8");
    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv())).stdout);
    const source = planned.plan.sources[0];

    const invalidMerge = await execaNode(
      ["dist/cli/index.js", "ingest", "mark", "--root", root, "--source", source.rawPath, "--status", "merged"],
      fixedEnv(),
      false
    );
    expect(invalidMerge.exitCode).toBe(29);
    expect(invalidMerge.stderr).toContain("mark summarized first");
    const skipWithoutReason = await execaNode(
      ["dist/cli/index.js", "ingest", "mark", "--root", root, "--source", source.rawPath, "--status", "skipped"],
      fixedEnv(),
      false
    );
    expect(skipWithoutReason.exitCode).toBe(29);
    expect(skipWithoutReason.stderr).toContain("requires --reason");

    await writeFile(
      path.join(root, source.expectedSummaryPath),
      `---\ntype: source\nstatus: reviewed\n---\n# Source\nrawPath: ${source.rawPath}\nsha256: ${source.sha256}\n`,
      "utf8"
    );
    await execaNode(["dist/cli/index.js", "ingest", "mark", "--root", root, "--source", source.rawPath, "--status", "summarized"], fixedEnv());
    await execaNode(["dist/cli/index.js", "ingest", "mark", "--root", root, "--source", source.rawPath, "--status", "merged"], fixedEnv());
    const missingCitation = await execaNode(["dist/cli/index.js", "ingest", "validate", "--root", root], fixedEnv(), false);
    expect(missingCitation.exitCode).toBe(30);
    expect(missingCitation.stderr).toContain("no durable wiki page cites");
    await writeFile(
      path.join(root, "wiki/topics/source-topic.md"),
      `---\ntype: topic\nstatus: reviewed\nsources:\n  - ${source.expectedSummaryPath}\n---\n# Source Topic\nCites ${source.expectedSummaryPath}.\n`,
      "utf8"
    );
    const validated = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "validate", "--root", root, "--json"], fixedEnv())).stdout);
    expect(validated.plan.planStatus).toBe("validated");
    expect(validated.plan.summaryCounts).toMatchObject({ merged: 1, validationFailures: 0 });

    const autoSelect = await execaNode(["dist/cli/index.js", "ingest", "status", "--root", root], fixedEnv(), false);
    expect(autoSelect.exitCode).toBe(24);
    expect(autoSelect.stderr).toContain("No active ingest plan found");
  });

  it("imports extractor reports and rejects malformed extractor state", async () => {
    const root = await initializedVault("llm-wiki-ingest-extractor-");
    await writeFile(path.join(root, "raw/sources/source.md"), "Source\n", "utf8");
    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv())).stdout);
    const reportPath = path.join(root, "extractor.json");
    await writeFile(
      reportPath,
      JSON.stringify({
        schemaVersion: 1,
        planId: planned.plan.planId,
        createdAt: "2026-06-10T00:00:00.000Z",
        extractorName: "test-extractor",
        sources: [
          {
            rawPath: "raw/sources/source.md",
            contentKind: "markdown",
            titleCandidates: ["Source"],
            roughTopics: ["testing"],
            complexity: "low",
            estimatedTokens: 42,
            batchHints: ["keep-small"]
          }
        ]
      }),
      "utf8"
    );
    const imported = JSON.parse(
      (await execaNode(["dist/cli/index.js", "ingest", "import-extractors", "--root", root, "--file", reportPath, "--json"], fixedEnv())).stdout
    );
    expect(imported.plan.sources[0].extractorMetadata).toMatchObject({ extractorName: "test-extractor", estimatedTokens: 42 });
    expect(imported.plan.batches[0].estimatedTokens).toBe(42);

    await writeFile(reportPath, JSON.stringify({ schemaVersion: 1, planId: "wrong", createdAt: "now", extractorName: "bad", sources: [] }), "utf8");
    const wrongPlan = await execaNode(["dist/cli/index.js", "ingest", "import-extractors", "--root", root, "--file", reportPath], fixedEnv(), false);
    expect(wrongPlan.exitCode).toBe(32);
    expect(wrongPlan.stderr).toContain("does not match");
  });

  it("detects raw drift and malformed sidecar JSON", async () => {
    const root = await initializedVault("llm-wiki-ingest-drift-");
    await writeFile(path.join(root, "raw/sources/source.md"), "Original\n", "utf8");
    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv())).stdout);
    await writeFile(path.join(root, "raw/sources/source.md"), "Changed\n", "utf8");

    const status = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "status", "--root", root, "--json"], fixedEnv())).stdout);
    expect(status.plan.sources[0].status).toBe("changed");

    const validate = await execaNode(["dist/cli/index.js", "ingest", "validate", "--root", root], fixedEnv(), false);
    expect(validate.exitCode).toBe(28);
    expect(validate.stderr).toContain("hash changed since planning");

    await writeFile(path.join(root, `wiki/ingest-plans/${planned.plan.planId}.json`), "{ bad json", "utf8");
    const malformed = await execaNode(["dist/cli/index.js", "ingest", "status", "--root", root, "--plan", planned.plan.planId], fixedEnv(), false);
    expect(malformed.exitCode).toBe(26);
    expect(malformed.stderr).toContain("Invalid JSON");
  });
});

async function initializedVault(prefix: string): Promise<string> {
  const root = await tempRoot(prefix);
  await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
  return root;
}

function fixedEnv(): Record<string, string> {
  return {
    LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z"
  };
}

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

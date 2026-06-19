import { chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execaNode } from "./helpers/process.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSION_TIMEOUT_MS, defaultConversionOptions } from "../src/core/ingest/converters.js";

const INGEST_PLAN_DIR = ".llm-wiki-skills/ingest-plans";

describe("ingest cli", () => {
  it("uses a long enough default Marker conversion timeout for real model startup", () => {
    expect(DEFAULT_CONVERSION_TIMEOUT_MS).toBe(600_000);
    expect(defaultConversionOptions().timeoutMs).toBe(600_000);
  });

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
    await expect(readFile(path.join(root, `${INGEST_PLAN_DIR}/ingest-20260610-000000.json`), "utf8")).resolves.toContain('"planStatus": "active"');
    await expect(readFile(path.join(root, `${INGEST_PLAN_DIR}/ingest-20260610-000000.md`), "utf8")).resolves.toContain("## Batches");
    await expect(readFile(path.join(root, "wiki/ingest-plans/ingest-20260610-000000.json"), "utf8")).rejects.toThrow();
  });

  it("converts Marker-supported raw files with fake marker_single output and assets", async () => {
    const root = await initializedVault("llm-wiki-ingest-marker-success-");
    const fake = await fakeMarkerBin();
    await writeFile(path.join(root, "raw/sources/report.pdf"), "fake pdf\n", "utf8");

    const result = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv(fake.env));
    const output = JSON.parse(result.stdout);
    const source = output.plan.sources[0];

    expect(source.conversionStatus).toBe("converted");
    expect(source.converterName).toBe("marker");
    expect(source.converterCommand).toContain("marker_single");
    expect(source.convertedMarkdownPath).toMatch(/^\.llm-wiki-skills\/ingest-plans\/ingest-20260610-000000\/converted\/src-0001-/);
    expect(source.convertedAssetPaths).toEqual([expect.stringContaining("images/page-1.png")]);
    await expect(readFile(path.join(root, source.convertedMarkdownPath), "utf8")).resolves.toContain("Converted report.pdf");
    await expect(readFile(path.join(root, `${INGEST_PLAN_DIR}/ingest-20260610-000000.md`), "utf8")).resolves.toContain("Read for summary:");
  });

  it("streams Marker conversion logs in grey for human plan output only", async () => {
    const root = await initializedVault("llm-wiki-ingest-marker-logs-");
    const fake = await fakeMarkerBin();
    await writeFile(path.join(root, "raw/sources/report.pdf"), "fake pdf\n", "utf8");

    const human = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root], fixedEnv({ ...fake.env, MARKER_MODE: "progress" }));

    expect(human.stdout).toContain("◆ Ingest planned");
    expect(human.stderr).toContain("\x1b[90m");
    expect(human.stderr).toContain("marker_single");
    expect(human.stderr).toContain("marker progress 1");

    const jsonRoot = await initializedVault("llm-wiki-ingest-marker-json-logs-");
    await writeFile(path.join(jsonRoot, "raw/sources/report.pdf"), "fake pdf\n", "utf8");
    const json = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", jsonRoot, "--json"], fixedEnv({ ...fake.env, MARKER_MODE: "progress" }));

    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout).plan.sources[0].conversionStatus).toBe("converted");
  });

  it("records missing Marker and validate reports the unhandled conversion state", async () => {
    const root = await initializedVault("llm-wiki-ingest-marker-missing-");
    const emptyBin = await tempRoot("llm-wiki-empty-marker-bin-");
    await writeFile(path.join(root, "raw/sources/report.pdf"), "fake pdf\n", "utf8");

    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv({ PATH: emptyBin }))).stdout);
    expect(planned.plan.sources[0].conversionStatus).toBe("missing-tool");
    expect(planned.plan.sources[0].conversionError).toContain("Install Marker");

    const validate = await execaNode(["dist/cli/index.js", "ingest", "validate", "--root", root], fixedEnv({ PATH: emptyBin }), false);
    expect(validate.exitCode).toBe(33);
    expect(validate.stderr).toContain("conversion is missing-tool");
  });

  it("records disabled conversion state with --no-convert", async () => {
    const root = await initializedVault("llm-wiki-ingest-no-convert-");
    await writeFile(path.join(root, "raw/sources/report.pdf"), "fake pdf\n", "utf8");

    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--no-convert", "--json"], fixedEnv())).stdout);
    expect(planned.plan.sources[0].conversionStatus).toBe("disabled");
    expect(planned.plan.sources[0].conversionError).toContain("--no-convert");
  });

  it("reports converter status as JSON", async () => {
    const fake = await fakeMarkerBin();
    const result = await execaNode(["dist/cli/index.js", "ingest", "converters", "status", "--json"], fixedEnv(fake.env));
    const output = JSON.parse(result.stdout);

    expect(output.converters).toEqual([
      expect.objectContaining({
        name: "marker",
        available: true,
        command: "marker_single"
      })
    ]);
  });

  it("finds Marker from the managed virtual environment without a PATH marker", async () => {
    const root = await initializedVault("llm-wiki-ingest-marker-managed-venv-");
    const fake = await fakeMarkerVenv();
    await writeFile(path.join(root, "raw/sources/report.pdf"), "fake pdf\n", "utf8");

    const result = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv(fake.env));
    const output = JSON.parse(result.stdout);
    const source = output.plan.sources[0];

    expect(source.conversionStatus).toBe("converted");
    expect(source.converterCommand).toContain(path.join(fake.venv, "bin", "marker_single"));
    await expect(readFile(path.join(root, source.convertedMarkdownPath), "utf8")).resolves.toContain("Converted report.pdf");
  });

  it("rejects invalid ingest conversion CLI flags", async () => {
    const root = await initializedVault("llm-wiki-ingest-flag-reject-");

    const conflicting = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--convert", "--no-convert"], fixedEnv(), false);
    expect(conflicting.exitCode).toBe(1);
    expect(conflicting.stderr).toContain("Conflicting conversion options");

    const badConverter = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--converter", "docling"], fixedEnv(), false);
    expect(badConverter.exitCode).toBe(1);
    expect(badConverter.stderr).toContain("--converter requires: marker");

    const badWorkers = await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--conversion-workers", "0"], fixedEnv(), false);
    expect(badWorkers.exitCode).toBe(1);
    expect(badWorkers.stderr).toContain("--conversion-workers requires a positive integer");

    const wrongAction = await execaNode(["dist/cli/index.js", "ingest", "status", "--root", root, "--conversion-max-mb", "2"], fixedEnv(), false);
    expect(wrongAction.exitCode).toBe(1);
    expect(wrongAction.stderr).toContain("--conversion-max-mb only applies to ingest plan");
  });

  it("records conversion timeout, nonzero exit, empty output, unsupported extension, and oversized files", async () => {
    const fake = await fakeMarkerBin();

    const timeoutRoot = await initializedVault("llm-wiki-ingest-marker-timeout-");
    await writeFile(path.join(timeoutRoot, "raw/sources/report.pdf"), "fake pdf\n", "utf8");
    const timeout = JSON.parse(
      (
        await execaNode(
          ["dist/cli/index.js", "ingest", "plan", "--root", timeoutRoot, "--conversion-timeout-ms", "1", "--json"],
          fixedEnv({ ...fake.env, MARKER_MODE: "timeout" })
        )
      ).stdout
    );
    expect(timeout.plan.sources[0].conversionStatus).toBe("timeout");
    expect(timeout.plan.sources[0].conversionError).toContain("--conversion-timeout-ms");

    const failedRoot = await initializedVault("llm-wiki-ingest-marker-failed-");
    await writeFile(path.join(failedRoot, "raw/sources/report.pdf"), "fake pdf\n", "utf8");
    const failed = JSON.parse(
      (await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", failedRoot, "--json"], fixedEnv({ ...fake.env, MARKER_MODE: "failed" }))).stdout
    );
    expect(failed.plan.sources[0].conversionStatus).toBe("failed");
    expect(failed.plan.sources[0].conversionError).toContain("marker failed");

    const emptyRoot = await initializedVault("llm-wiki-ingest-marker-empty-");
    await writeFile(path.join(emptyRoot, "raw/sources/report.pdf"), "fake pdf\n", "utf8");
    const empty = JSON.parse(
      (await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", emptyRoot, "--json"], fixedEnv({ ...fake.env, MARKER_MODE: "empty" }))).stdout
    );
    expect(empty.plan.sources[0].conversionStatus).toBe("missing-output");
    expect(empty.plan.sources[0].conversionError).toContain("empty markdown");

    const unsupportedRoot = await initializedVault("llm-wiki-ingest-unsupported-");
    await writeFile(path.join(unsupportedRoot, "raw/sources/archive.bin"), "raw\n", "utf8");
    const unsupported = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", unsupportedRoot, "--json"], fixedEnv(fake.env))).stdout);
    expect(unsupported.plan.sources[0].conversionStatus).toBe("unsupported");

    const oversizedRoot = await initializedVault("llm-wiki-ingest-oversized-");
    await writeFile(path.join(oversizedRoot, "raw/sources/big.pdf"), Buffer.alloc(2 * 1024 * 1024));
    const oversized = JSON.parse(
      (await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", oversizedRoot, "--conversion-max-mb", "1", "--json"], fixedEnv(fake.env))).stdout
    );
    expect(oversized.plan.sources[0].conversionStatus).toBe("oversized");
    expect(oversized.plan.sources[0].conversionError).toContain("above the 1 MB conversion limit");
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

  it("skips raw/archieved files even when scanning all raw files", async () => {
    const root = await initializedVault("llm-wiki-ingest-skip-archieved-");
    await mkdir(path.join(root, "raw/archieved/sources"), { recursive: true });
    await writeFile(path.join(root, "raw/archieved/sources/old.md"), "Already ingested\n", "utf8");
    await writeFile(path.join(root, "raw/sources/new.md"), "New source\n", "utf8");

    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--raw", "raw", "--json"], fixedEnv())).stdout);

    expect(planned.plan.sources.map((source: { rawPath: string }) => source.rawPath)).toEqual(["raw/sources/new.md"]);
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
    await expect(readFile(path.join(root, "raw/sources/source.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, "raw/archieved/sources/source.md"), "utf8")).resolves.toContain("Source claim");
    const archivedStatus = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "status", "--root", root, "--json"], fixedEnv())).stdout);
    expect(archivedStatus.plan.sources[0]).toMatchObject({ rawPath: source.rawPath, archivedRawPath: "raw/archieved/sources/source.md" });
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
    expect(validated.plan.sources[0]).toMatchObject({ rawPath: source.rawPath, archivedRawPath: "raw/archieved/sources/source.md" });
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

    await writeFile(path.join(root, `${INGEST_PLAN_DIR}/${planned.plan.planId}.json`), "{ bad json", "utf8");
    const malformed = await execaNode(["dist/cli/index.js", "ingest", "status", "--root", root, "--plan", planned.plan.planId], fixedEnv(), false);
    expect(malformed.exitCode).toBe(26);
    expect(malformed.stderr).toContain("Invalid JSON");
  });

  it("can read legacy wiki ingest plans when explicitly requested", async () => {
    const root = await initializedVault("llm-wiki-ingest-legacy-plan-");
    await writeFile(path.join(root, "raw/sources/source.md"), "Source\n", "utf8");
    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv())).stdout);
    const legacyPlan = { ...planned.plan, planId: "legacy-plan" };
    await mkdir(path.join(root, "wiki/ingest-plans"), { recursive: true });
    await writeFile(path.join(root, "wiki/ingest-plans/legacy-plan.json"), JSON.stringify(legacyPlan, null, 2), "utf8");

    const status = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "status", "--root", root, "--plan", "legacy-plan", "--json"], fixedEnv())).stdout);

    expect(status.plan.planId).toBe("legacy-plan");
  });

  it("rejects unsafe converted paths during validation", async () => {
    const root = await initializedVault("llm-wiki-ingest-unsafe-converted-");
    const fake = await fakeMarkerBin();
    await writeFile(path.join(root, "raw/sources/report.pdf"), "fake pdf\n", "utf8");
    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--json"], fixedEnv(fake.env))).stdout);
    planned.plan.sources[0].convertedMarkdownPath = ".llm-wiki-skills/ingest-plans/escape.md";
    await writeFile(path.join(root, planned.planPath), JSON.stringify(planned.plan, null, 2), "utf8");

    const validate = await execaNode(["dist/cli/index.js", "ingest", "validate", "--root", root], fixedEnv(fake.env), false);
    expect(validate.exitCode).toBe(38);
    expect(validate.stderr).toContain("unsafe convertedMarkdownPath");
  });

  it("loads and validates existing v1 ingest plans by normalizing them in memory", async () => {
    const root = await initializedVault("llm-wiki-ingest-v1-");
    await writeFile(path.join(root, "raw/sources/source.md"), "Source claim\n", "utf8");
    const planned = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "plan", "--root", root, "--no-convert", "--json"], fixedEnv())).stdout);
    const source = planned.plan.sources[0];
    await writeFile(
      path.join(root, source.expectedSummaryPath),
      `---\ntype: source\nstatus: reviewed\n---\n# Source\nrawPath: ${source.rawPath}\nsha256: ${source.sha256}\n`,
      "utf8"
    );
    source.status = "merged";
    delete source.conversionStatus;
    delete source.conversionError;
    planned.plan.schemaVersion = 1;
    planned.plan.sources = [source];
    planned.plan.summaryCounts = { ...planned.plan.summaryCounts, planned: 0, merged: 1 };
    await writeFile(path.join(root, planned.planPath), JSON.stringify(planned.plan, null, 2), "utf8");
    await writeFile(
      path.join(root, "wiki/topics/source-topic.md"),
      `---\ntype: topic\nstatus: reviewed\nsources:\n  - ${source.expectedSummaryPath}\n---\n# Source Topic\nCites ${source.expectedSummaryPath}.\n`,
      "utf8"
    );

    const validated = JSON.parse((await execaNode(["dist/cli/index.js", "ingest", "validate", "--root", root, "--plan", planned.plan.planId, "--json"], fixedEnv())).stdout);
    expect(validated.plan.schemaVersion).toBe(2);
    expect(validated.plan.sources[0].conversionStatus).toBe("not-needed");
    expect(validated.plan.sources[0].archivedRawPath).toBe("raw/archieved/sources/source.md");
    await expect(readFile(path.join(root, "raw/archieved/sources/source.md"), "utf8")).resolves.toContain("Source claim");
    expect(validated.plan.planStatus).toBe("validated");
  });

  it("generated Codex and Claude ingest skills mention converted markdown and raw provenance", async () => {
    const root = await tempRoot("llm-wiki-ingest-skill-copy-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--host", "claude-code", "--quiet"], fixedEnv());

    const codex = await readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8");
    const claude = await readFile(path.join(root, ".claude/skills/llm-wiki-ingest/SKILL.md"), "utf8");
    const combined = `${codex}\n${claude}`;
    expect(combined).toContain("Read for summary:");
    expect(combined).toContain(".llm-wiki-skills/ingest-plans/<planId>.md");
    expect(combined).toContain("The ingest planner owns converter tools.");
    expect(combined).toContain("Do not try ad hoc PDF/OCR extraction tools first");
    expect(combined).toContain("converted markdown");
    expect(combined).toContain("original raw path plus SHA-256");
    expect(combined).toContain("raw/archieved/");
  });
});

async function initializedVault(prefix: string): Promise<string> {
  const root = await tempRoot(prefix);
  await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
  return root;
}

function fixedEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z",
    LLM_WIKI_MARKER_VENV: path.join(os.tmpdir(), "llm-wiki-skills-test-missing-marker-venv"),
    ...extra
  };
}

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function fakeMarkerBin(): Promise<{ bin: string; env: Record<string, string> }> {
  const bin = await tempRoot("llm-wiki-fake-marker-bin-");
  const marker = path.join(bin, "marker_single");
  await writeFile(
    marker,
    `#!/bin/sh
if [ "$1" = "--help" ]; then
  echo "fake marker"
  exit 0
fi
out=""
input="$1"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output_dir" ]; then
    shift
    out="$1"
  fi
  shift
done
if [ "$MARKER_MODE" = "timeout" ]; then
  sleep 2
  exit 0
fi
if [ "$MARKER_MODE" = "failed" ]; then
  echo "marker failed" >&2
  exit 7
fi
if [ "$MARKER_MODE" = "progress" ]; then
  printf "marker progress 1\\r" >&2
  printf "marker progress 2\\n" >&2
fi
mkdir -p "$out/images"
if [ "$MARKER_MODE" = "empty" ]; then
  : > "$out/output.md"
else
  printf "# Converted %s\\n\\nBody from Marker.\\n" "$(basename "$input")" > "$out/output.md"
fi
printf "fake image" > "$out/images/page-1.png"
`,
    "utf8"
  );
  await chmod(marker, 0o755);
  return { bin, env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` } };
}

async function fakeMarkerVenv(): Promise<{ venv: string; env: Record<string, string> }> {
  const venv = await tempRoot("llm-wiki-fake-marker-venv-");
  const bin = path.join(venv, "bin");
  const marker = path.join(bin, "marker_single");
  await mkdir(bin, { recursive: true });
  await writeFile(
    marker,
    `#!/bin/sh
if [ "$1" = "--help" ]; then
  echo "fake managed marker"
  exit 0
fi
out=""
input="$1"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output_dir" ]; then
    shift
    out="$1"
  fi
  shift
done
/bin/mkdir -p "$out/images"
printf "# Converted %s\\n\\nBody from managed Marker.\\n" "$(/usr/bin/basename "$input")" > "$out/output.md"
printf "fake image" > "$out/images/page-1.png"
`,
    "utf8"
  );
  await chmod(marker, 0o755);
  return { venv, env: { PATH: "/bin:/usr/bin", LLM_WIKI_MARKER_VENV: venv } };
}

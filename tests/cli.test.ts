import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { INIT_CANCELED_MESSAGE } from "../src/core/errors.js";
import { execaNode } from "./helpers/process.js";
import { describe, expect, it } from "vitest";

describe("cli", () => {
  it("init --host codex generates Codex assets only", async () => {
    const root = await tempRoot("llm-wiki-codex-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());

    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-lint/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Lint");
    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-ingest/SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(root, ".obsidian/graph.json"), "utf8")).resolves.toContain('"search": "path:wiki/"');
    await expect(readFile(path.join(root, ".gitignore"), "utf8")).resolves.toContain("# llm-wiki-skills: obsidian start");

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.hosts).toEqual(["codex"]);
    expect(manifest.integrations).toMatchObject({ obsidian: { enabled: true, schemaVersion: 1 } });
    expect(manifest.files).toContain(".obsidian/graph.json");
  });

  it("init --no-obsidian skips Obsidian files and integration metadata", async () => {
    const root = await tempRoot("llm-wiki-no-obsidian-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-obsidian", "--json"], fixedEnv());

    const output = JSON.parse(result.stdout);
    expect(output.obsidian).toBe(false);
    expect(output.files[".gitignore"]).toBeUndefined();
    await expect(readFile(path.join(root, ".obsidian/graph.json"), "utf8")).rejects.toThrow();

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations).toBeUndefined();
    expect(manifest.files).not.toContain(".obsidian/graph.json");

    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    expect(JSON.parse(status.stdout)).toMatchObject({ status: "pass", hosts: ["codex"] });
  });

  it("conflicting Obsidian flags fail", async () => {
    const root = await tempRoot("llm-wiki-obsidian-conflict-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--obsidian", "--no-obsidian"], fixedEnv(), false);

    expect(result.exitCode).toBe(16);
    expect(result.stderr).toContain("Conflicting Obsidian options");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("init --host claude-code generates Claude assets only", async () => {
    const root = await tempRoot("llm-wiki-claude-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "claude-code", "--quiet"], fixedEnv());

    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8")).rejects.toThrow();

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.hosts).toEqual(["claude-code"]);
  });

  it("repeated and comma --host values generate both hosts", async () => {
    const root = await tempRoot("llm-wiki-both-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex,claude-code", "--host", "codex", "--quiet"], fixedEnv());

    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");
    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.hosts).toEqual(["claude-code", "codex"]);
  });

  it("init --topic writes topic metadata, directories, and routing guide", async () => {
    const root = await tempRoot("llm-wiki-topic-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "finance", "--json"], fixedEnv());

    const output = JSON.parse(result.stdout);
    expect(output.topic).toMatchObject({ id: "finance", scaffoldId: "finance", label: "Finance" });
    expect(output.files["wiki/accounts/"]).toBe("created");
    expect(output.files["docs/llm-wiki-routing.md"]).toBe("created");
    expect((await stat(path.join(root, "wiki/accounts"))).isDirectory()).toBe(true);
    await expect(readFile(path.join(root, "docs/llm-wiki-routing.md"), "utf8")).resolves.toContain("`wiki/accounts/`: Bank");

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.topic).toMatchObject({ id: "finance", scaffoldId: "finance" });
    expect(manifest.files).not.toContain("docs/llm-wiki-routing.md");
    expect(manifest.directories).not.toContain("wiki/accounts");
  });

  it("--template is an alias for --topic and matching duplicate values are allowed", async () => {
    const root = await tempRoot("llm-wiki-template-alias-");
    const result = await execaNode(
      ["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "trip-plan", "--template", "trip-plan", "--json"],
      fixedEnv()
    );

    const output = JSON.parse(result.stdout);
    expect(output.topic).toMatchObject({ id: "trip-plan", scaffoldId: "trip-plan" });
    expect(output.files["wiki/itinerary/"]).toBe("created");
  });

  it("medical replaces the old health-fitness topic", async () => {
    const root = await tempRoot("llm-wiki-medical-topic-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "medical", "--json"], fixedEnv());

    const output = JSON.parse(result.stdout);
    expect(output.topic).toMatchObject({ id: "medical", scaffoldId: "medical", label: "Medical" });
    expect(output.files["wiki/anatomy/"]).toBe("created");
    await expect(readFile(path.join(root, "docs/llm-wiki-routing.md"), "utf8")).resolves.toContain("`wiki/drugs/`: Medications");

    const invalid = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "health-fitness"], fixedEnv(), false);
    expect(invalid.exitCode).toBe(14);
    expect(invalid.stderr).toContain("Unknown topic: health-fitness.");
    expect(invalid.stderr).toContain("medical");
  });

  it("conflicting --topic and --template values fail", async () => {
    const root = await tempRoot("llm-wiki-topic-conflict-");
    const result = await execaNode(
      ["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "finance", "--template", "trip-plan"],
      fixedEnv(),
      false
    );

    expect(result.exitCode).toBe(15);
    expect(result.stderr).toContain("Conflicting topic values: finance, trip-plan");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("invalid topic values fail", async () => {
    const root = await tempRoot("llm-wiki-invalid-topic-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "unknown"], fixedEnv(), false);

    expect(result.exitCode).toBe(14);
    expect(result.stderr).toContain("Unknown topic: unknown.");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("custom topic validates handoff text and stays machine-friendly for json and quiet", async () => {
    const jsonRoot = await tempRoot("llm-wiki-custom-json-");
    const quietRoot = await tempRoot("llm-wiki-custom-quiet-");
    const invalidRoot = await tempRoot("llm-wiki-custom-invalid-");

    const json = await execaNode(
      ["dist/cli/index.js", "init", "--root", jsonRoot, "--host", "codex", "--topic", "custom", "--custom-topic", "AI operations notes", "--json"],
      fixedEnv()
    );
    const parsed = JSON.parse(json.stdout);
    expect(parsed.topic).toMatchObject({ id: "custom", scaffoldId: "general", customTopic: "AI operations notes" });
    expect(parsed.customHandoffPrompt).toContain("AI operations notes");
    expect(json.stdout).not.toMatch(/\x1b\[/);
    await expect(readFile(path.join(jsonRoot, "docs/llm-wiki-routing.md"), "utf8")).resolves.toContain("Topic: Custom topic (custom)");

    const quiet = await execaNode(
      ["dist/cli/index.js", "init", "--root", quietRoot, "--host", "codex", "--topic", "custom", "--custom-topic", "AI operations notes", "--quiet"],
      fixedEnv()
    );
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).toBe("");

    const invalid = await execaNode(
      ["dist/cli/index.js", "init", "--root", invalidRoot, "--host", "codex", "--topic", "custom", "--custom-topic", "line\nbreak"],
      fixedEnv(),
      false
    );
    expect(invalid.exitCode).toBe(14);
    expect(invalid.stderr).toContain("--custom-topic must be 1-120 printable single-line characters.");
    expectProjectErrorCodeHidden(invalid.stderr);
  });

  it("non-TTY init without host returns HostRequiredError", async () => {
    const root = await tempRoot("llm-wiki-host-required-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(10);
    expect(result.stderr).toBe("Select at least one host with --host when running outside a TTY.\n");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("interactive init previews and writes after confirmation", async () => {
    const root = await tempRoot("llm-wiki-interactive-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv({ hosts: ["codex"], confirm: true }));

    expect(result.stdout).toContain("LLM Wiki init preview");
    expect(result.stdout).toContain("Obsidian enabled");
    expect(result.stdout).toContain(".agents/skills/llm-wiki-ingest/SKILL.md");
    expect(result.stdout).toContain(".obsidian/graph.json");
    expect(result.stdout).toContain("◆ LLM Wiki is ready.");
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
  });

  it("human init output summarizes changes without dumping every path status", async () => {
    const root = await tempRoot("llm-wiki-human-output-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "medical"], fixedEnv());

    expect(result.stdout).toContain("◆ LLM Wiki is ready.");
    expect(result.stdout).toContain("● Changed: 28 created, 0 updated, 3 left alone.");
    expect(result.stdout).toContain("✓ Set up");
    expect(result.stdout).toContain("  • Agent skills");
    expect(result.stdout).toContain("  • Wiki pages and topic folders");
    expect(result.stdout).toContain("  • Obsidian vault settings");
    expect(result.stdout).toContain("○ Left alone");
    expect(result.stdout).toContain("  • wiki/questions/");
    expect(result.stdout).toContain("◇ Obsidian");
    expect(result.stdout).toContain("→ Next\n  npx llm-wiki-skills status");
    expect(result.stdout).not.toContain("Paths:");
    expect(result.stdout).not.toContain("- created .agents/skills/llm-wiki-ingest/SKILL.md");
  });

  it("interactive init writes both hosts after confirmation", async () => {
    const root = await tempRoot("llm-wiki-interactive-both-");
    await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv({ hosts: ["codex", "claude-code"], confirm: true }));

    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");
    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");
  });

  it("interactive init cancel before host selection writes nothing", async () => {
    const root = await tempRoot("llm-wiki-interactive-cancel-hosts-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv({ cancel: "hosts" }), false);

    expect(result.exitCode).toBe(11);
    expect(result.stderr).toBe(`${INIT_CANCELED_MESSAGE}\n`);
    expectProjectErrorCodeHidden(result.stderr);
    await expect(readFile(path.join(root, ".llm-wiki-skills.json"), "utf8")).rejects.toThrow();
  });

  it("interactive init cancel during topic selection writes nothing", async () => {
    const root = await tempRoot("llm-wiki-interactive-cancel-topic-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv({ hosts: ["codex"], cancel: "topic" }), false);

    expect(result.exitCode).toBe(11);
    expect(result.stderr).toBe(`${INIT_CANCELED_MESSAGE}\n`);
    expectProjectErrorCodeHidden(result.stderr);
    await expect(readFile(path.join(root, ".llm-wiki-skills.json"), "utf8")).rejects.toThrow();
  });

  it("interactive init rejected preview writes nothing", async () => {
    const root = await tempRoot("llm-wiki-interactive-reject-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv({ hosts: ["codex"], confirm: false }), false);

    expect(result.exitCode).toBe(11);
    expect(result.stderr).toBe(`${INIT_CANCELED_MESSAGE}\n`);
    expectProjectErrorCodeHidden(result.stderr);
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8")).rejects.toThrow();
  });

  it("json and quiet init do not open interactive prompts without --host", async () => {
    const jsonRoot = await tempRoot("llm-wiki-json-no-host-");
    const quietRoot = await tempRoot("llm-wiki-quiet-no-host-");
    const json = await execaNode(["dist/cli/index.js", "init", "--root", jsonRoot, "--json"], fixedEnv({ hosts: ["codex"] }), false);
    const quiet = await execaNode(["dist/cli/index.js", "init", "--root", quietRoot, "--quiet"], fixedEnv({ hosts: ["codex"] }), false);

    expect(json.exitCode).toBe(10);
    expect(json.stdout).toBe("");
    expect(json.stderr).not.toMatch(/\x1b\[/);
    expect(quiet.exitCode).toBe(10);
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).not.toMatch(/\x1b\[/);
  });

  it("json and quiet scripted init output stays machine-friendly", async () => {
    const jsonRoot = await tempRoot("llm-wiki-json-output-");
    const quietRoot = await tempRoot("llm-wiki-quiet-output-");
    const json = await execaNode(["dist/cli/index.js", "init", "--root", jsonRoot, "--host", "codex", "--json"], fixedEnv());
    const quiet = await execaNode(["dist/cli/index.js", "init", "--root", quietRoot, "--host", "codex", "--quiet"], fixedEnv());

    expect(JSON.parse(json.stdout)).toMatchObject({ root: jsonRoot, hosts: ["codex"], topic: { id: "general", scaffoldId: "general" }, obsidian: true });
    expect(JSON.parse(json.stdout).obsidianHandoff).toContain("Native graph is configured");
    expect(json.stdout).not.toMatch(/\x1b\[/);
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).toBe("");
  });

  it("unknown host returns InvalidHostError", async () => {
    const root = await tempRoot("llm-wiki-invalid-host-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "unknown"], fixedEnv(), false);
    expect(result.exitCode).toBe(9);
    expect(result.stderr).toBe("Unknown host: unknown. Supported hosts: codex, claude-code\n");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("does not keep deprecated public command aliases", async () => {
    const result = await execaNode(["dist/cli/index.js", "health"], fixedEnv(), false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("llm-wiki-skills status");
    expect(result.stdout).not.toContain("llm-wiki-skills health");
  });

  it("help explains the local skill installer and host targets", async () => {
    const result = await execaNode(["dist/cli/index.js", "--help"], fixedEnv());
    expect(result.stdout).toContain("Install local LLM Wiki skills for AI agents.");
    expect(result.stdout).toContain("codex        writes repo skills to .agents/skills");
    expect(result.stdout).toContain("claude-code  writes project skills to .claude/skills");
  });

  it("generated assets include required sections without retired CLI instructions", async () => {
    const root = await tempRoot("llm-wiki-assets-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex,claude-code", "--quiet"], fixedEnv());

    const files = [
      "docs/llm-wiki-contract.md",
      "docs/llm-wiki-workflows.md",
      ".agents/skills/llm-wiki-ingest/SKILL.md",
      ".agents/skills/llm-wiki-query/SKILL.md",
      ".agents/skills/llm-wiki-lint/SKILL.md",
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
    for (const file of files.filter((candidate) => candidate.endsWith("/SKILL.md"))) {
      const content = await readFile(path.join(root, file), "utf8");
      expect(content).toMatch(/^---\nname: llm-wiki-(ingest|query|lint)\ndescription: .+\n---\n\n# LLM Wiki (Ingest|Query|Lint)/);
    }
  });

  it("status --json passes after init", async () => {
    const root = await tempRoot("llm-wiki-status-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    expect(JSON.parse(status.stdout)).toMatchObject({
      status: "pass",
      hosts: ["codex"],
      topic: { id: "general", scaffoldId: "general" },
      integrations: { obsidian: { enabled: true } }
    });
  });

  it("status fails for a missing Obsidian generated file when integration is enabled", async () => {
    const root = await tempRoot("llm-wiki-missing-obsidian-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await rm(path.join(root, ".obsidian/graph.json"));

    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain("Required file missing: .obsidian/graph.json");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("status passes after deleting optional topic scaffold pages", async () => {
    const root = await tempRoot("llm-wiki-status-optional-topic-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "finance", "--quiet"], fixedEnv());
    await rm(path.join(root, "wiki/accounts"), { recursive: true });
    await rm(path.join(root, "docs/llm-wiki-routing.md"));

    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    expect(JSON.parse(status.stdout)).toMatchObject({ status: "pass", topic: { id: "finance", scaffoldId: "finance" } });
  });

  it("status fails for missing manifest", async () => {
    const root = await tempRoot("llm-wiki-no-manifest-");
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain("Missing manifest: .llm-wiki-skills.json");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("status fails for invalid manifest JSON", async () => {
    const root = await tempRoot("llm-wiki-bad-json-");
    await writeFile(path.join(root, ".llm-wiki-skills.json"), "{", "utf8");
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(13);
    expect(result.stderr).toContain("Invalid manifest JSON in .llm-wiki-skills.json");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("status fails for a missing shared reference", async () => {
    const root = await tempRoot("llm-wiki-missing-ref-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await rm(path.join(root, "docs/llm-wiki-contract.md"));
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain("Required file missing: docs/llm-wiki-contract.md");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("status fails for a missing host skill", async () => {
    const root = await tempRoot("llm-wiki-missing-skill-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "claude-code", "--quiet"], fixedEnv());
    await rm(path.join(root, ".claude/skills/llm-wiki-query/SKILL.md"));
    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain("Required file missing: .claude/skills/llm-wiki-query/SKILL.md");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("status fails for manifest/files mismatch", async () => {
    const root = await tempRoot("llm-wiki-mismatch-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    const manifestPath = path.join(root, ".llm-wiki-skills.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files = manifest.files.filter((file: string) => file !== ".agents/skills/llm-wiki-lint/SKILL.md");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(result.exitCode).toBe(13);
    expect(result.stderr).toContain("Manifest file registry does not match selected hosts.");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("rerun init does not overwrite existing user-edited files", async () => {
    const root = await tempRoot("llm-wiki-existing-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await writeFile(path.join(root, "wiki/overview.md"), "custom overview\n", "utf8");
    await writeFile(path.join(root, ".obsidian/graph.json"), "custom graph\n", "utf8");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await expect(readFile(path.join(root, "wiki/overview.md"), "utf8")).resolves.toBe("custom overview\n");
    await expect(readFile(path.join(root, ".obsidian/graph.json"), "utf8")).resolves.toBe("custom graph\n");
  });

  it("rerun init skips edited topic scaffold files and adds missing optional scaffold pages", async () => {
    const root = await tempRoot("llm-wiki-topic-rerun-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "finance", "--quiet"], fixedEnv());
    await writeFile(path.join(root, "docs/llm-wiki-routing.md"), "custom finance\n", "utf8");

    const firstRerun = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "finance", "--json"], fixedEnv());
    expect(JSON.parse(firstRerun.stdout).files["docs/llm-wiki-routing.md"]).toBe("skipped");
    expect(JSON.parse(firstRerun.stdout).files["wiki/accounts/"]).toBe("skipped");
    await expect(readFile(path.join(root, "docs/llm-wiki-routing.md"), "utf8")).resolves.toBe("custom finance\n");

    await rm(path.join(root, "docs/llm-wiki-routing.md"));
    await rm(path.join(root, "wiki/accounts"), { recursive: true });
    const secondRerun = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "finance", "--json"], fixedEnv());
    expect(JSON.parse(secondRerun.stdout).files["docs/llm-wiki-routing.md"]).toBe("created");
    expect(JSON.parse(secondRerun.stdout).files["wiki/accounts/"]).toBe("created");
    await expect(readFile(path.join(root, "docs/llm-wiki-routing.md"), "utf8")).resolves.toContain("# LLM Wiki Routing");
  });
});

function fixedEnv(promptAnswers?: Record<string, unknown>): Record<string, string> {
  return {
    LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z",
    ...(promptAnswers ? { LLM_WIKI_SKILLS_TEST_PROMPTS: JSON.stringify(promptAnswers) } : {})
  };
}

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function expectProjectErrorCodeHidden(stderr: string): void {
  expect(stderr).not.toMatch(
    /(VaultNotFoundError|InvalidFrontmatterError|BrokenLinkError|GraphDriftError|ImmutableRawViolationError|WriteConflictError|PackageAssetMissingError|InvalidHostError|InvalidTopicError|ConflictingTopicOptionError|ConflictingObsidianOptionError|HostRequiredError|HostSelectionCanceledError|RequiredFileMissingError|ManifestMismatchError):/
  );
}

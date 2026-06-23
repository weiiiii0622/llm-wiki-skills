import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { INIT_CANCELED_MESSAGE } from "../src/core/errors.js";
import { TOPIC_TEMPLATE_IDS } from "../src/core/topic-templates.js";
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

  it("conflicting qmd flags fail", async () => {
    const root = await tempRoot("llm-wiki-qmd-conflict-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd", "--no-qmd"], fixedEnv(), false);

    expect(result.exitCode).toBe(17);
    expect(result.stderr).toContain("Conflicting qmd options");
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
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "investment", "--json"], fixedEnv());

    const output = JSON.parse(result.stdout);
    expect(output.topic).toMatchObject({ id: "investment", scaffoldId: "investment", label: "Investment" });
    expect(output.files["wiki/companies/"]).toBe("created");
    expect(output.files["docs/llm-wiki-routing.md"]).toBe("created");
    expect((await stat(path.join(root, "wiki/companies"))).isDirectory()).toBe(true);
    await expect(readFile(path.join(root, "docs/llm-wiki-routing.md"), "utf8")).resolves.toContain("`wiki/companies/`: Company");

    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.topic).toMatchObject({ id: "investment", scaffoldId: "investment" });
    expect(manifest.files).not.toContain("docs/llm-wiki-routing.md");
    expect(manifest.directories).not.toContain("wiki/companies");
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
      ["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "investment", "--template", "trip-plan"],
      fixedEnv(),
      false
    );

    expect(result.exitCode).toBe(15);
    expect(result.stderr).toContain("Conflicting topic values: investment, trip-plan");
    expectProjectErrorCodeHidden(result.stderr);
  });

  it("rejects the removed finance topic", async () => {
    const root = await tempRoot("llm-wiki-removed-finance-topic-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "finance"], fixedEnv(), false);

    expect(result.exitCode).toBe(14);
    expect(result.stderr).toContain("Unknown topic: finance.");
    expect(result.stderr).toContain("investment");
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

  it("init --qmd enables qmd only after fake qmd setup succeeds", async () => {
    const root = await tempRoot("llm-wiki-qmd-init-");
    const fake = await fakeQmdEnv();
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd", "--json"], fixedEnv(undefined, fake.env));

    const output = JSON.parse(result.stdout);
    expect(output.qmd).toBe(true);
    expect(output.qmdStatus.status).toBe("enabled");
    expect(output.qmdStatus.message).toContain("hybrid semantic search");
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toMatchObject({
      enabled: true,
      schemaVersion: 2,
      docsPath: "docs/llm-wiki-qmd.md",
      searchMode: "hybrid",
      runtimeMode: "gpu-auto",
      lastIndexedAt: "2026-06-10T00:00:00.000Z",
      lastEmbeddedAt: "2026-06-10T00:00:00.000Z"
    });
    expect(manifest.integrations.qmd.collection).toMatch(/^llm-wiki-[a-f0-9]{12}$/);
    expect(manifest.files).toContain("docs/llm-wiki-qmd.md");
    await expect(readFile(path.join(root, "docs/llm-wiki-qmd.md"), "utf8")).resolves.toContain("qmd query --json");
    const qmdLog = await readFile(fake.log, "utf8");
    expect(qmdLog).toContain("collection add");
    expect(qmdLog).toContain("qmd update");
    expect(qmdLog).toContain(`qmd embed -c ${manifest.integrations.qmd.collection} --max-docs-per-batch 8 --max-batch-mb 8`);
  });

  it("init --qmd prompts to install qmd when missing and user accepts", async () => {
    const root = await tempRoot("llm-wiki-qmd-install-");
    const fake = await fakeInstallableQmdEnv();
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd"], fixedEnv({ qmdInstall: true }, fake.env));

    expect(result.stdout).toContain("Running `npm install -g @tobilu/qmd`...");
    expect(result.stdout).toContain("installing qmd fake log");
    expect(result.stdout).toContain("◇ qmd");
    expect(result.stdout).toContain("qmd enabled");
    expect(await readFile(fake.log, "utf8")).toContain("npm install -g @tobilu/qmd");
    expect(await readFile(fake.log, "utf8")).toContain(`npm-cwd ${await realpath(root)}`);
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toMatchObject({ enabled: true, searchMode: "hybrid", runtimeMode: "gpu-auto" });
  });

  it("interactive init installs qmd before preview and create confirmation", async () => {
    const root = await tempRoot("llm-wiki-qmd-wizard-install-");
    const fake = await fakeInstallableQmdEnv();
    const result = await execaNode(
      ["dist/cli/index.js", "init", "--root", root],
      fixedEnv({ hosts: ["codex"], qmd: true, qmdInstall: true, confirm: true }, fake.env)
    );

    const installStart = result.stdout.indexOf("Running `npm install -g @tobilu/qmd`...");
    const installLog = result.stdout.indexOf("installing qmd fake log");
    const preview = result.stdout.indexOf("LLM Wiki init preview");
    const report = result.stdout.indexOf("◇ qmd");
    expect(installStart).toBeGreaterThanOrEqual(0);
    expect(installLog).toBeGreaterThan(installStart);
    expect(preview).toBeGreaterThan(installLog);
    expect(report).toBeGreaterThan(preview);
    expect(result.stdout).toContain("qmd enabled");
    expect(await readFile(fake.log, "utf8")).toContain("npm install -g @tobilu/qmd");
    expect(await readFile(fake.log, "utf8")).toContain(`npm-cwd ${await realpath(root)}`);
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toMatchObject({ enabled: true, searchMode: "hybrid", runtimeMode: "gpu-auto" });
  });

  it("interactive init detects installed Marker and shows it above qmd in preview", async () => {
    const root = await tempRoot("llm-wiki-marker-wizard-available-");
    const fake = await fakeMarkerEnv();
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root], fixedEnv({ hosts: ["codex"], qmd: false, confirm: true }, fake.env));

    const marker = result.stdout.indexOf("Marker available (marker_single)");
    const qmd = result.stdout.indexOf("qmd disabled");
    expect(marker).toBeGreaterThanOrEqual(0);
    expect(qmd).toBeGreaterThan(marker);
    expect(result.stdout).not.toContain("Running `python3 -m venv");
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
  });

  it("interactive init prompts to install Marker before qmd when Marker is missing", async () => {
    const root = await tempRoot("llm-wiki-marker-wizard-install-");
    const fake = await fakeInstallableMarkerEnv();
    const result = await execaNode(
      ["dist/cli/index.js", "init", "--root", root],
      fixedEnv({ hosts: ["codex"], markerInstall: true, qmd: false, confirm: true }, fake.env)
    );

    const installStart = result.stdout.indexOf("Running `python3 -m venv");
    const installLog = result.stdout.indexOf("installing marker fake log");
    const pipInstall = result.stdout.indexOf("-m pip install marker-pdf[full]");
    const preview = result.stdout.indexOf("LLM Wiki init preview");
    const marker = result.stdout.indexOf("Marker installed during setup");
    const qmd = result.stdout.indexOf("qmd disabled");
    expect(installStart).toBeGreaterThanOrEqual(0);
    expect(pipInstall).toBeGreaterThan(installStart);
    expect(installLog).toBeGreaterThan(pipInstall);
    expect(preview).toBeGreaterThan(installLog);
    expect(marker).toBeGreaterThan(preview);
    expect(qmd).toBeGreaterThan(marker);
    expect(await readFile(fake.log, "utf8")).toContain("python3 -m venv");
    expect(await readFile(fake.log, "utf8")).toContain("venv-python -m pip install marker-pdf[full]");
    expect(await readFile(fake.log, "utf8")).toContain(`python-cwd ${await realpath(root)}`);
  });

  it("interactive init records missing Marker when the user declines installation", async () => {
    const root = await tempRoot("llm-wiki-marker-wizard-declined-");
    const emptyBin = await tempRoot("llm-wiki-empty-marker-wizard-bin-");
    const result = await execaNode(
      ["dist/cli/index.js", "init", "--root", root],
      fixedEnv({ hosts: ["codex"], markerInstall: false, qmd: false, confirm: true }, { PATH: emptyBin })
    );

    expect(result.stdout).toContain("Marker not installed");
    expect(result.stdout).not.toContain("Running `python3 -m venv");
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
  });

  it("init --qmd reports qmd enable follow-up when user declines installation", async () => {
    const root = await tempRoot("llm-wiki-qmd-declined-");
    const emptyBin = await tempRoot("llm-wiki-empty-bin-");
    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd"], fixedEnv({ qmdInstall: false }, { PATH: emptyBin }));

    expect(result.stdout).toContain("◇ qmd");
    expect(result.stdout).toContain("npx llm-wiki-skills qmd enable");
    expect(result.stderr).toBe("");
    await expect(readFile(path.join(root, "wiki/index.md"), "utf8")).resolves.toContain("# Wiki Index");
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toBeUndefined();
    expect(manifest.files).not.toContain("docs/llm-wiki-qmd.md");
  });

  it("qmd enable, reindex, status, and disable use fake qmd lifecycle", async () => {
    const root = await tempRoot("llm-wiki-qmd-command-");
    const fake = await fakeQmdEnv();
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-qmd", "--quiet"], fixedEnv());

    const enabled = await execaNode(["dist/cli/index.js", "qmd", "enable", "--root", root, "--json"], fixedEnv(undefined, fake.env));
    expect(JSON.parse(enabled.stdout)).toMatchObject({ status: "enabled", docsPath: "docs/llm-wiki-qmd.md" });

    const reindexed = await execaNode(["dist/cli/index.js", "qmd", "reindex", "--root", root, "--json"], fixedEnv(undefined, fake.env));
    expect(JSON.parse(reindexed.stdout)).toMatchObject({ status: "reindexed" });

    const status = await execaNode(["dist/cli/index.js", "qmd", "status", "--root", root, "--json"], fixedEnv(undefined, fake.env));
    expect(JSON.parse(status.stdout)).toMatchObject({ status: "enabled" });

    const disabled = await execaNode(["dist/cli/index.js", "qmd", "disable", "--root", root, "--json"], fixedEnv(undefined, fake.env));
    expect(JSON.parse(disabled.stdout).message).toContain("left untouched");
    await expect(readFile(path.join(root, "docs/llm-wiki-qmd.md"), "utf8")).rejects.toThrow();
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toBeUndefined();
  });

  it("qmd enable and reindex show current qmd commands in human output", async () => {
    const root = await tempRoot("llm-wiki-qmd-command-progress-");
    const fake = await fakeQmdEnv();
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-qmd", "--quiet"], fixedEnv());

    const enabled = await execaNode(["dist/cli/index.js", "qmd", "enable", "--root", root], fixedEnv(undefined, fake.env));
    expect(enabled.stdout).toContain("Running `qmd --version`...");
    expect(enabled.stdout).toContain("Running `qmd doctor`...");
    expect(enabled.stdout).toContain("Running `qmd init`...");
    expect(enabled.stdout).toContain("Running `qmd collection add");
    expect(enabled.stdout).toContain(" --name ");
    expect(enabled.stdout).toContain("Running `qmd update`...");
    expect(enabled.stdout).toContain("Running `qmd embed -c ");
    expect(enabled.stdout).toContain(" --max-docs-per-batch 8 --max-batch-mb 8`...");
    expect(enabled.stdout).toContain("qmd: enabled");

    const reindexed = await execaNode(["dist/cli/index.js", "qmd", "reindex", "--root", root], fixedEnv(undefined, fake.env));
    expect(reindexed.stdout).toContain("Running `qmd update`...");
    expect(reindexed.stdout).toContain("Running `qmd embed -c ");
    expect(reindexed.stdout).toContain(" --max-docs-per-batch 8 --max-batch-mb 8`...");
    expect(reindexed.stdout).toContain("qmd: reindexed");
  });

  it("qmd enable prompts to install qmd when missing", async () => {
    const root = await tempRoot("llm-wiki-qmd-enable-install-");
    const fake = await fakeInstallableQmdEnv();
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-qmd", "--quiet"], fixedEnv());

    const enabled = await execaNode(["dist/cli/index.js", "qmd", "enable", "--root", root], fixedEnv({ qmdInstall: true }, fake.env));

    expect(enabled.stdout).toContain("Running `npm install -g @tobilu/qmd`...");
    expect(enabled.stdout).toContain("installing qmd fake log");
    expect(enabled.stdout).toContain("qmd: enabled");
    expect(await readFile(fake.log, "utf8")).toContain("npm install -g @tobilu/qmd");
    expect(await readFile(fake.log, "utf8")).toContain(`npm-cwd ${await realpath(root)}`);
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toMatchObject({ enabled: true });
  });

  it("qmd enable reports follow-up when user declines qmd installation", async () => {
    const root = await tempRoot("llm-wiki-qmd-enable-declined-");
    const emptyBin = await tempRoot("llm-wiki-empty-qmd-enable-bin-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-qmd", "--quiet"], fixedEnv());

    const declined = await execaNode(["dist/cli/index.js", "qmd", "enable", "--root", root], fixedEnv({ qmdInstall: false }, { PATH: emptyBin }));

    expect(declined.stdout).toContain("qmd: disabled");
    expect(declined.stdout).toContain("npx llm-wiki-skills qmd enable");
    expect(declined.stderr).toBe("");
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toBeUndefined();
  });

  it("qmd enable can re-enable after disable when the qmd collection already exists", async () => {
    const root = await tempRoot("llm-wiki-qmd-reenable-");
    const fake = await fakeQmdEnv();
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-qmd", "--quiet"], fixedEnv());

    await execaNode(["dist/cli/index.js", "qmd", "enable", "--root", root, "--quiet"], fixedEnv(undefined, fake.env));
    await execaNode(["dist/cli/index.js", "qmd", "disable", "--root", root, "--quiet"], fixedEnv(undefined, fake.env));
    const reenabled = await execaNode(["dist/cli/index.js", "qmd", "enable", "--root", root, "--json"], fixedEnv(undefined, fake.env));

    expect(JSON.parse(reenabled.stdout)).toMatchObject({ status: "enabled" });
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toMatchObject({ enabled: true });
  });

  it("init --qmd embeds only after generated wiki files exist", async () => {
    const root = await tempRoot("llm-wiki-qmd-embed-order-");
    const fake = await fakeQmdEnv();

    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd", "--json"], fixedEnv(undefined, fake.env));

    const log = await readFile(fake.log, "utf8");
    expect(log).toContain("embed-wiki exists");
    expect(log.indexOf("qmd collection add")).toBeLessThan(log.indexOf("qmd update"));
    expect(log.indexOf("qmd update")).toBeLessThan(log.indexOf("qmd embed -c"));
  });

  it("non-interactive semantic setup retries qmd embed in CPU mode after GPU failure", async () => {
    const root = await tempRoot("llm-wiki-qmd-cpu-fallback-");
    const fake = await fakeQmdEnv();

    const enabled = await execaNode(
      ["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd", "--json"],
      fixedEnv(undefined, { ...fake.env, QMD_EMBED_GPU_FAIL: "1" })
    );

    expect(enabled.stdout).not.toContain("embedding progress");
    const output = JSON.parse(enabled.stdout);
    expect(output.qmdStatus).toMatchObject({ searchMode: "hybrid", runtimeMode: "cpu-forced" });
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toMatchObject({ searchMode: "hybrid", runtimeMode: "cpu-forced" });
    const log = await readFile(fake.log, "utf8");
    expect(log.match(/qmd embed -c .+ --max-docs-per-batch 8 --max-batch-mb 8/g)).toHaveLength(2);
    expect(log).toContain("embed-cpu 1");
  });

  it("quiet semantic setup suppresses qmd embed progress", async () => {
    const root = await tempRoot("llm-wiki-qmd-quiet-semantic-");
    const fake = await fakeQmdEnv();

    const result = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd", "--quiet"], fixedEnv(undefined, fake.env));

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(await readFile(fake.log, "utf8")).toContain("qmd embed");
  });

  it("interactive semantic setup can fall back to qmd full-text search after GPU failure", async () => {
    const root = await tempRoot("llm-wiki-qmd-keyword-fallback-");
    const fake = await fakeQmdEnv();

    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-qmd", "--quiet"], fixedEnv());
    const fallback = await execaNode(
      ["dist/cli/index.js", "qmd", "enable", "--root", root],
      fixedEnv({ qmdCpu: false }, { ...fake.env, QMD_EMBED_GPU_FAIL: "1" })
    );

    expect(fallback.stdout).toContain("Search mode: keyword");
    expect(fallback.stdout).toContain("Runtime mode: keyword-fallback");
    const manifest = JSON.parse(await readFile(path.join(root, ".llm-wiki-skills.json"), "utf8"));
    expect(manifest.integrations.qmd).toMatchObject({ schemaVersion: 2, searchMode: "keyword", runtimeMode: "keyword-fallback" });
    expect(await readFile(path.join(root, "docs/llm-wiki-qmd.md"), "utf8")).toContain("qmd search --json");
  });

  it("status accepts qmd v1 metadata and reindex migrates it to semantic v2", async () => {
    const root = await tempRoot("llm-wiki-qmd-v1-migrate-");
    const fake = await fakeQmdEnv();
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-qmd", "--quiet"], fixedEnv());
    await writeFile(path.join(root, "docs/llm-wiki-qmd.md"), "legacy qmd docs\n", "utf8");
    const manifestPath = path.join(root, ".llm-wiki-skills.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.integrations = {
      ...(manifest.integrations ?? {}),
      qmd: {
        enabled: true,
        schemaVersion: 1,
        collection: "legacy",
        root,
        docsPath: "docs/llm-wiki-qmd.md",
        searchMode: "keyword",
        lastIndexedAt: "2026-06-01T00:00:00.000Z"
      }
    };
    manifest.files.push("docs/llm-wiki-qmd.md");
    manifest.files.sort();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    expect(JSON.parse(status.stdout).integrations.qmd).toMatchObject({ schemaVersion: 1, searchMode: "keyword" });

    await execaNode(["dist/cli/index.js", "qmd", "reindex", "--root", root, "--json"], fixedEnv(undefined, fake.env));

    const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(migrated.integrations.qmd).toMatchObject({ schemaVersion: 2, collection: "legacy", searchMode: "hybrid", runtimeMode: "gpu-auto" });
    expect(migrated.integrations.qmd.lastEmbeddedAt).toBe("2026-06-10T00:00:00.000Z");
    expect(await readFile(path.join(root, "docs/llm-wiki-qmd.md"), "utf8")).toContain("qmd query --json");
  });

  it("status rejects inconsistent qmd v2 semantic metadata", async () => {
    const root = await tempRoot("llm-wiki-qmd-invalid-v2-");
    const fake = await fakeQmdEnv();
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--qmd", "--quiet"], fixedEnv(undefined, fake.env));
    const manifestPath = path.join(root, ".llm-wiki-skills.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.integrations.qmd.searchMode = "keyword";
    manifest.integrations.qmd.runtimeMode = "gpu-auto";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const invalid = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);

    expect(invalid.exitCode).toBe(13);
    expect(invalid.stderr).toContain("inconsistent qmd semantic metadata");

    manifest.integrations.qmd.searchMode = "hybrid";
    manifest.integrations.qmd.runtimeMode = "gpu-auto";
    manifest.integrations.qmd.models = manifest.integrations.qmd.models.slice(0, 1);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const invalidModels = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(invalidModels.exitCode).toBe(13);
    expect(invalidModels.stderr).toContain("unsupported qmd model metadata");
  });

  it("generated query skills choose qmd commands from manifest state", async () => {
    const root = await tempRoot("llm-wiki-qmd-generated-skills-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex,claude-code", "--quiet"], fixedEnv());

    const codex = await readFile(path.join(root, ".agents/skills/llm-wiki-query/SKILL.md"), "utf8");
    const claude = await readFile(path.join(root, ".claude/skills/llm-wiki-query/SKILL.md"), "utf8");
    for (const content of [codex, claude]) {
      expect(content).toContain('searchMode: "hybrid"');
      expect(content).toContain("qmd query --json");
      expect(content).toContain("QMD_FORCE_CPU=1 qmd query --json");
      expect(content).toContain("qmd search --json");
      expect(content).toContain("markdown remains the source of truth");
    }
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
    expect(combined).toContain("Use `npx llm-wiki-skills` by default for CLI commands.");
    expect(combined).toContain("npx llm-wiki-skills ingest plan");
    expect(combined).toContain("The ingest planner owns converter tools.");
    expect(combined).toContain("npx llm-wiki-skills ingest converters status");
    expect(combined).toContain("Do not try ad hoc PDF/OCR extraction tools first");
    expect(combined).toContain("pdfinfo");
    expect(combined).toContain("pdftotext");
    expect(combined).toContain("pypdf");
    expect(combined).toContain("pdfplumber");
    expect(combined).toContain("npx llm-wiki-skills qmd reindex");
    expect(combined).not.toContain("Run `llm-wiki-skills ingest plan");
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
      integrations: { obsidian: { enabled: true } },
      okf: {
        version: "0.1",
        status: "pass",
        issueCount: 0,
        conceptPageCount: 6,
        reservedFileCount: 2
      }
    });
  });

  it("status human output includes compact OKF summary", async () => {
    const root = await tempRoot("llm-wiki-status-human-okf-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());

    const status = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv());

    expect(status.stdout).toContain("Status: PASS");
    expect(status.stdout).toContain("OKF: PASS v0.1 (6 concept pages, 2 reserved files, 0 issues)");
  });

  it("init generates OKF root index, log, concept metadata, and docs", async () => {
    const root = await tempRoot("llm-wiki-init-okf-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());

    await expect(readFile(path.join(root, "wiki/index.md"), "utf8")).resolves.toContain('okf_version: "0.1"');
    await expect(readFile(path.join(root, "wiki/log.md"), "utf8")).resolves.toBe("# Wiki Log\n\n## 2026-06-10\n\n- Initialized vault with llm-wiki-skills.\n");
    const overview = await readFile(path.join(root, "wiki/overview.md"), "utf8");
    expect(overview).toContain("title: Overview");
    expect(overview).toContain("description: Starting page");
    expect(overview).toContain("timestamp: 2026-06-10");
    await expect(readFile(path.join(root, "docs/llm-wiki-contract.md"), "utf8")).resolves.toContain("## OKF Mapping");
  });

  it("lint passes for every topic scaffold", async () => {
    for (const topic of TOPIC_TEMPLATE_IDS) {
      const root = await tempRoot(`llm-wiki-${topic}-okf-`);
      await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", topic, "--quiet"], fixedEnv());
      const lint = await execaNode(["dist/cli/index.js", "lint", "--root", root], fixedEnv());
      expect(lint.stdout).toBe("Lint passed: no issues found.\n");
    }
  });

  it("lint reports OKF concept pages missing type", async () => {
    const root = await tempRoot("llm-wiki-okf-missing-type-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await writeFile(
      path.join(root, "wiki/topics/no-type.md"),
      "---\ntitle: No Type\ndescription: Missing type field.\ntimestamp: 2026-06-10\nstatus: draft\n---\n# No Type\n",
      "utf8"
    );

    const result = await execaNode(["dist/cli/index.js", "lint", "--root", root], fixedEnv(), false);

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toContain("InvalidFrontmatterError wiki/topics/no-type.md");
    expect(result.stdout).toContain("OkfConformanceError wiki/topics/no-type.md");
    expect(result.stdout).toContain("OKF concept page requires string frontmatter field: type");
  });

  it("lint reports OKF log and reserved index violations", async () => {
    const root = await tempRoot("llm-wiki-okf-reserved-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    await mkdir(path.join(root, "wiki/topics"), { recursive: true });
    await writeFile(path.join(root, "wiki/log.md"), "---\ntype: log\n---\n# Wiki Log\n\n## Bad Date\n\n- Entry.\n", "utf8");
    await writeFile(path.join(root, "wiki/topics/index.md"), "---\ntype: topic\n---\n# Topic Index\n", "utf8");

    const result = await execaNode(["dist/cli/index.js", "lint", "--root", root], fixedEnv(), false);

    expect(result.exitCode).toBe(39);
    expect(result.stdout).toContain("OkfConformanceError wiki/log.md: OKF log.md must not have frontmatter");
    expect(result.stdout).toContain("OkfConformanceError wiki/log.md: OKF log heading must use ## YYYY-MM-DD: ## Bad Date");
    expect(result.stdout).toContain("OkfConformanceError wiki/topics/index.md: Reserved nested index.md/log.md files must not use concept frontmatter");
  });

  it("status --json reports non-string OKF version as compact failure", async () => {
    const root = await tempRoot("llm-wiki-okf-bad-version-");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--quiet"], fixedEnv());
    const index = await readFile(path.join(root, "wiki/index.md"), "utf8");
    await writeFile(path.join(root, "wiki/index.md"), index.replace('okf_version: "0.1"', "okf_version: [0.1]"), "utf8");

    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    const parsed = JSON.parse(status.stdout);

    expect(parsed.status).toBe("fail");
    expect(parsed.okf).toMatchObject({ status: "fail", issueCount: 1 });
    expect(parsed.okf.issues).toBeUndefined();
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
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "investment", "--quiet"], fixedEnv());
    await rm(path.join(root, "wiki/companies"), { recursive: true });
    await rm(path.join(root, "docs/llm-wiki-routing.md"));

    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    expect(JSON.parse(status.stdout)).toMatchObject({ status: "pass", topic: { id: "investment", scaffoldId: "investment" } });
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

  it("status validates qmd-only metadata and rejects unknown integrations", async () => {
    const root = await tempRoot("llm-wiki-qmd-validation-");
    const fake = await fakeQmdEnv();
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--no-obsidian", "--qmd", "--quiet"], fixedEnv(undefined, fake.env));
    const status = await execaNode(["dist/cli/index.js", "status", "--root", root, "--json"], fixedEnv());
    expect(JSON.parse(status.stdout)).toMatchObject({ integrations: { qmd: { enabled: true } } });

    const manifestPath = path.join(root, ".llm-wiki-skills.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.integrations.unknown = { enabled: true };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const invalid = await execaNode(["dist/cli/index.js", "status", "--root", root], fixedEnv(), false);
    expect(invalid.exitCode).toBe(13);
    expect(invalid.stderr).toContain("unsupported integration keys: unknown");
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
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "investment", "--quiet"], fixedEnv());
    await writeFile(path.join(root, "docs/llm-wiki-routing.md"), "custom investment\n", "utf8");

    const firstRerun = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "investment", "--json"], fixedEnv());
    expect(JSON.parse(firstRerun.stdout).files["docs/llm-wiki-routing.md"]).toBe("skipped");
    expect(JSON.parse(firstRerun.stdout).files["wiki/companies/"]).toBe("skipped");
    await expect(readFile(path.join(root, "docs/llm-wiki-routing.md"), "utf8")).resolves.toBe("custom investment\n");

    await rm(path.join(root, "docs/llm-wiki-routing.md"));
    await rm(path.join(root, "wiki/companies"), { recursive: true });
    const secondRerun = await execaNode(["dist/cli/index.js", "init", "--root", root, "--host", "codex", "--topic", "investment", "--json"], fixedEnv());
    expect(JSON.parse(secondRerun.stdout).files["docs/llm-wiki-routing.md"]).toBe("created");
    expect(JSON.parse(secondRerun.stdout).files["wiki/companies/"]).toBe("created");
    await expect(readFile(path.join(root, "docs/llm-wiki-routing.md"), "utf8")).resolves.toContain("# LLM Wiki Routing");
  });
});

function fixedEnv(promptAnswers?: Record<string, unknown>, extraEnv: Record<string, string> = {}): Record<string, string> {
  return {
    LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z",
    LLM_WIKI_MARKER_VENV: path.join(os.tmpdir(), "llm-wiki-skills-test-missing-marker-venv"),
    ...extraEnv,
    ...(promptAnswers ? { LLM_WIKI_SKILLS_TEST_PROMPTS: JSON.stringify(promptAnswers) } : {})
  };
}

async function fakeQmdEnv(): Promise<{ env: Record<string, string>; log: string }> {
  const bin = await tempRoot("llm-wiki-fake-qmd-bin-");
  const log = path.join(bin, "qmd.log");
  const state = path.join(bin, "collections.txt");
  await mkdir(bin, { recursive: true });
  await writeExecutable(
    path.join(bin, "qmd"),
    `#!/bin/sh
printf "qmd %s\\n" "$*" >> "$QMD_LOG"
if [ "$QMD_FAIL" = "$1" ]; then
  echo "forced qmd failure" >&2
  exit 2
fi
if [ "$1" = "embed" ]; then
  if [ "$2" != "-c" ] || [ -z "$3" ] || [ "$4" != "--max-docs-per-batch" ] || [ "$5" != "8" ] || [ "$6" != "--max-batch-mb" ] || [ "$7" != "8" ]; then
    echo "expected embed -c <collection> --max-docs-per-batch 8 --max-batch-mb 8" >&2
    exit 2
  fi
  printf "embed-collection %s\\n" "$3" >> "$QMD_LOG"
  if [ "$QMD_EMBED_GPU_FAIL" = "1" ] && [ -z "$QMD_FORCE_CPU" ]; then
    echo "CUDA backend failed" >&2
    exit 2
  fi
  if [ -f "wiki/index.md" ]; then
    echo "embed-wiki exists" >> "$QMD_LOG"
  else
    echo "embed-wiki missing" >> "$QMD_LOG"
  fi
  printf "embed-cpu %s\\n" "$QMD_FORCE_CPU" >> "$QMD_LOG"
  echo "embedding progress"
fi
if [ "$1 $2" = "collection add" ]; then
  if [ "$4" != "--name" ] || [ -z "$5" ]; then
    echo "expected collection add <path> --name <name>" >&2
    exit 2
  fi
  collection_path="$3"
  collection="$5"
  printf "collection-path %s\\n" "$collection_path" >> "$QMD_LOG"
  printf "collection-name %s\\n" "$collection" >> "$QMD_LOG"
  if grep -qx "$collection" "$QMD_COLLECTION_STATE" 2>/dev/null; then
    echo "Collection '$collection' already exists." >&2
    echo "Use a different name with --name <name>" >&2
    exit 2
  fi
  echo "$collection" >> "$QMD_COLLECTION_STATE"
fi
exit 0
`
  );
  await writeExecutable(
    path.join(bin, "npm"),
    `#!/bin/sh
printf "npm %s\\n" "$*" >> "$QMD_LOG"
exit 0
`
  );
  return { env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`, QMD_LOG: log, QMD_COLLECTION_STATE: state }, log };
}

async function fakeInstallableQmdEnv(): Promise<{ env: Record<string, string>; log: string }> {
  const bin = await tempRoot("llm-wiki-installable-qmd-bin-");
  const log = path.join(bin, "qmd.log");
  await mkdir(bin, { recursive: true });
  await writeExecutable(
    path.join(bin, "npm"),
    `#!/bin/sh
printf "npm %s\\n" "$*" >> "$QMD_LOG"
printf "npm-cwd %s\\n" "$PWD" >> "$QMD_LOG"
echo "installing qmd fake log"
printf '%s\\n' '#!/bin/sh' 'printf "qmd %s\\\\n" "$*" >> "$QMD_LOG"' 'exit 0' > "$QMD_INSTALL_BIN/qmd"
/bin/chmod +x "$QMD_INSTALL_BIN/qmd"
exit 0
`
  );
  return { env: { PATH: bin, QMD_LOG: log, QMD_INSTALL_BIN: bin }, log };
}

async function fakeMarkerEnv(): Promise<{ env: Record<string, string>; log: string }> {
  const bin = await tempRoot("llm-wiki-fake-marker-wizard-bin-");
  const log = path.join(bin, "marker.log");
  await mkdir(bin, { recursive: true });
  await writeExecutable(
    path.join(bin, "marker_single"),
    `#!/bin/sh
printf "marker_single %s\\n" "$*" >> "$MARKER_LOG"
exit 0
`
  );
  return { env: { PATH: bin, MARKER_LOG: log }, log };
}

async function fakeInstallableMarkerEnv(): Promise<{ env: Record<string, string>; log: string }> {
  const bin = await tempRoot("llm-wiki-installable-marker-bin-");
  const venv = await tempRoot("llm-wiki-marker-venv-");
  const log = path.join(bin, "marker.log");
  await mkdir(bin, { recursive: true });
  await writeExecutable(
    path.join(bin, "python3"),
    `#!/bin/sh
printf "python3 %s\\n" "$*" >> "$MARKER_LOG"
printf "python-cwd %s\\n" "$PWD" >> "$MARKER_LOG"
if [ "$1 $2" = "-m venv" ]; then
  /bin/mkdir -p "$3/bin"
  printf '%s\\n' '#!/bin/sh' 'printf "venv-python %s\\\\n" "$*" >> "$MARKER_LOG"' 'echo "installing marker fake log"' 'printf "%s\\\\n" "#!/bin/sh" "exit 0" > "$MARKER_VENV/bin/marker_single"' '/bin/chmod +x "$MARKER_VENV/bin/marker_single"' 'exit 0' > "$3/bin/python"
  /bin/chmod +x "$3/bin/python"
fi
exit 0
`
  );
  return { env: { PATH: bin, MARKER_LOG: log, MARKER_VENV: venv, LLM_WIKI_MARKER_VENV: venv }, log };
}

async function writeExecutable(target: string, content: string): Promise<void> {
  await writeFile(target, content, "utf8");
  await chmod(target, 0o755);
}

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function expectProjectErrorCodeHidden(stderr: string): void {
  expect(stderr).not.toMatch(
    /(VaultNotFoundError|InvalidFrontmatterError|BrokenLinkError|GraphDriftError|ImmutableRawViolationError|WriteConflictError|PackageAssetMissingError|InvalidHostError|InvalidTopicError|ConflictingTopicOptionError|ConflictingObsidianOptionError|ConflictingQmdOptionError|HostRequiredError|HostSelectionCanceledError|RequiredFileMissingError|ManifestMismatchError|QmdNotInstalledError|QmdRuntimeUnsupportedError|QmdDoctorFailedError|QmdCollectionError|QmdIndexUpdateError|QmdCommandError):/
  );
}

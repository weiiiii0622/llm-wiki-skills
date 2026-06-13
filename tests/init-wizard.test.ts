import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HostSelectionCanceledError } from "../src/core/errors.js";
import { buildInitPreviewModel, renderInitPreview, runInitWizard } from "../src/cli/init-wizard.js";
import { buildInitPlan, executeInitPlan } from "../src/cli/init-plan.js";
import { createScriptedPromptRuntime } from "../src/cli/prompt-runtime.js";

describe("init plan", () => {
  it("uses the same planned paths for preview and execution", async () => {
    const root = await tempRoot("llm-wiki-plan-");
    const plan = buildInitPlan(root, ["codex", "claude-code"]);
    const plannedPaths = plan.files.map((file) => file.relativePath).sort();
    const results = await executeInitPlan(plan);

    expect(Object.keys(results).sort()).toEqual(plannedPaths);
    expect(buildInitPreviewModel(plan).groups.flatMap((group) => group.files).sort()).toEqual(plannedPaths);
    await expect(readFile(path.join(root, ".agents/skills/llm-wiki-ingest/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Ingest");
    await expect(readFile(path.join(root, ".claude/skills/llm-wiki-query/SKILL.md"), "utf8")).resolves.toContain("# LLM Wiki Query");
  });

  it("marks existing files as skipped while still refreshing the manifest", async () => {
    const root = await tempRoot("llm-wiki-rerun-plan-");
    const plan = buildInitPlan(root, ["codex"]);
    await executeInitPlan(plan);

    const second = await executeInitPlan(plan);

    expect(second["wiki/overview.md"]).toBe("skipped");
    expect(second[".llm-wiki-skills.json"]).toBe("created");
  });
});

describe("init preview", () => {
  it("renders an undecorated preview for stable tests and non-TTY output", () => {
    const preview = renderInitPreview(buildInitPreviewModel(buildInitPlan("/tmp/wiki", ["codex"])), { decorated: false });

    expect(preview).toContain("LLM Wiki init preview");
    expect(preview).toContain("Root  /tmp/wiki");
    expect(preview).toContain("Codex");
    expect(preview).toContain(".agents/skills/llm-wiki-ingest/SKILL.md");
    expect(preview).not.toMatch(/\x1b\[/);
  });

  it("uses terminal decoration only when requested", () => {
    const preview = renderInitPreview(buildInitPreviewModel(buildInitPlan("/tmp/wiki", ["codex"])), { decorated: true });

    expect(preview).toContain("◆");
    expect(preview).toMatch(/\x1b\[/);
  });
});

describe("init wizard", () => {
  it("returns a plan after host selection and confirmation", async () => {
    const { runtime, write } = scriptedRuntime({ hosts: ["claude-code"], confirm: true });

    const plan = await runInitWizard("/tmp/wiki", runtime);

    expect(plan.hosts).toEqual(["claude-code"]);
    expect(write.mock.calls.join("\n")).toContain("LLM Wiki init preview");
  });

  it("cancels before writing when host selection is canceled", async () => {
    const { runtime } = scriptedRuntime({ cancel: "hosts" });

    await expect(runInitWizard("/tmp/wiki", runtime)).rejects.toBeInstanceOf(HostSelectionCanceledError);
  });

  it("cancels before writing when preview confirmation is rejected", async () => {
    const { runtime } = scriptedRuntime({ hosts: ["codex"], confirm: false });

    await expect(runInitWizard("/tmp/wiki", runtime)).rejects.toBeInstanceOf(HostSelectionCanceledError);
  });
});

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function scriptedRuntime(script: Parameters<typeof createScriptedPromptRuntime>[0]): {
  runtime: ReturnType<typeof createScriptedPromptRuntime>;
  write: ReturnType<typeof vi.fn>;
} {
  const write = vi.fn();
  return {
    runtime: createScriptedPromptRuntime(script, { output: { write } as unknown as NodeJS.WriteStream }),
    write
  };
}

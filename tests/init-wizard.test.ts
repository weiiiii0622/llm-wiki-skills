import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HostSelectionCanceledError } from "../src/core/errors.js";
import { buildInitPreviewModel, renderInitPreview, runInitWizard } from "../src/cli/init-wizard.js";
import { buildInitPlan, executeInitPlan } from "../src/cli/init-plan.js";
import {
  ENTER_ALTERNATE_SCREEN,
  EXIT_ALTERNATE_SCREEN,
  createPromptRuntime,
  createScriptedPromptRuntime,
  hostPromptChoices,
  topicOptionsPerPage
} from "../src/cli/prompt-runtime.js";
import { TOPIC_TEMPLATE_IDS, getTopicTemplate } from "../src/core/topic-templates.js";

const promptsMock = vi.hoisted(() => {
  const calls: unknown[] = [];
  return {
    calls,
    prompt: vi.fn(async (question: unknown) => {
      calls.push(question);
      return { topic: "writing-content" };
    })
  };
});

const enquirerMock = vi.hoisted(() => ({
  prompt: vi.fn()
}));

vi.mock("prompts", () => ({ default: promptsMock.prompt }));
vi.mock("enquirer", () => ({
  default: vi.fn(function EnquirerMock() {
    return enquirerMock;
  })
}));

describe("topic templates", () => {
  it("defines path-safe directories under wiki for every template", () => {
    for (const id of TOPIC_TEMPLATE_IDS) {
      const template = getTopicTemplate(id);
      expect(template.directories.length).toBeGreaterThan(0);
      for (const directory of template.directories) {
        expect(directory.relativePath).toMatch(/^wiki\/[a-z0-9/-]+$/);
        expect(directory.relativePath).not.toContain("..");
        expect(directory.purpose).toBeTruthy();
      }
    }
    expect(TOPIC_TEMPLATE_IDS).toContain("medical");
    expect(TOPIC_TEMPLATE_IDS as readonly string[]).not.toContain("health-fitness");
  });

  it("documents every topic template in the README", async () => {
    const readme = await readFile("README.md", "utf8");

    for (const id of TOPIC_TEMPLATE_IDS) {
      const template = getTopicTemplate(id);
      expect(readme).toContain(`### \`${id}\``);
      expect(readme).toContain(`${template.directories[0].relativePath.replace("wiki/", "")}/`);
    }
    expect(readme).toContain("### `custom`");
    expect(readme).toContain("--topic custom --custom-topic");
    expect(readme).toContain("The CLI does not call a hosted LLM");
  });
});

describe("init plan", () => {
  it("uses the same planned paths for preview and execution", async () => {
    const root = await tempRoot("llm-wiki-plan-");
    const plan = buildInitPlan(root, ["codex", "claude-code"]);
    const plannedPaths = [...plan.topicDirectories.map((directory) => `${directory}/`), ...plan.files.map((file) => file.relativePath)].sort();
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
    expect(second["wiki/projects/"]).toBe("skipped");
    expect(second["docs/llm-wiki-routing.md"]).toBe("skipped");
    expect(second[".llm-wiki-skills.json"]).toBe("created");
  });
});

describe("init preview", () => {
  it("renders an undecorated preview for stable tests and non-TTY output", () => {
    const preview = renderInitPreview(buildInitPreviewModel(buildInitPlan("/tmp/wiki", ["codex"])), { decorated: false });

    expect(preview).toContain("LLM Wiki init preview");
    expect(preview).toContain("Root  /tmp/wiki");
    expect(preview).toContain("Codex");
    expect(preview).toContain("Topic General wiki");
    expect(preview).toContain("Topic directories");
    expect(preview).toContain("Topic routing files");
    expect(preview).toContain("wiki/projects/");
    expect(preview).toContain("docs/llm-wiki-routing.md");
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
  it("maps Enquirer empty Escape cancellation to init cancellation", async () => {
    enquirerMock.prompt.mockRejectedValueOnce("");
    const runtime = createPromptRuntime({ output: { write: vi.fn() } as unknown as NodeJS.WriteStream });

    await expect(runtime.selectHosts(hostPromptChoices())).rejects.toBeInstanceOf(HostSelectionCanceledError);
  });

  it("requires at least one host in the interactive host prompt", async () => {
    enquirerMock.prompt.mockResolvedValueOnce({ hosts: ["codex"] });
    const runtime = createPromptRuntime({ output: { write: vi.fn() } as unknown as NodeJS.WriteStream });

    await runtime.selectHosts(hostPromptChoices());

    const question = enquirerMock.prompt.mock.calls[0]?.[0] as { validate: (value: unknown) => true | string };
    expect(question.validate([])).toBe("You must select at least one host.");
    expect(question.validate(["codex"])).toBe(true);
  });

  it("does not silently default an empty host prompt result to Codex", async () => {
    enquirerMock.prompt.mockResolvedValueOnce({ hosts: [] });
    const runtime = createPromptRuntime({ output: { write: vi.fn() } as unknown as NodeJS.WriteStream });

    await expect(runtime.selectHosts(hostPromptChoices())).rejects.toThrow("You must select at least one host.");
  });

  it("passes topic descriptions inline so prompts can render them beside the topic", async () => {
    promptsMock.calls.length = 0;
    const output = { write: vi.fn(), isTTY: true, columns: 240 } as unknown as NodeJS.WriteStream;
    const runtime = createPromptRuntime({ output, decorated: true });
    const hint = "Move from ideas and research to claims, outlines, drafts, revisions, references, and published work.";

    await runtime.selectTopic([
      {
        name: "writing-content",
        message: "Writing and content",
        hint,
        enabled: true
      }
    ]);

    const question = promptsMock.calls[0] as { choices: Array<{ description: string }> };
    expect(question.choices[0].description).toBe(hint);
    expect(question.choices[0].description).not.toContain("\n");
  });

  it("shows all topic choices when terminal height has enough room", async () => {
    promptsMock.calls.length = 0;
    const output = { write: vi.fn(), isTTY: true, columns: 240, rows: 40 } as unknown as NodeJS.WriteStream;
    const runtime = createPromptRuntime({ output, decorated: true });

    await runtime.selectTopic(topicPromptChoicesForTest());

    const question = promptsMock.calls[0] as { optionsPerPage: number };
    expect(question.optionsPerPage).toBe(topicPromptChoicesForTest().length);
  });

  it("keeps topic choice paging on short terminals", () => {
    const output = { write: vi.fn(), isTTY: true, columns: 100, rows: 12 } as unknown as NodeJS.WriteStream;

    expect(topicOptionsPerPage(output, topicPromptChoicesForTest().length)).toBe(9);
  });

  it("uses at least one topic choice on very short terminals so navigation still works", () => {
    const output = { write: vi.fn(), isTTY: true, columns: 100, rows: 3 } as unknown as NodeJS.WriteStream;

    expect(topicOptionsPerPage(output, topicPromptChoicesForTest().length)).toBe(1);
  });

  it("falls back to prompts default page size when terminal height is unknown", () => {
    const output = { write: vi.fn(), isTTY: true, columns: 100 } as unknown as NodeJS.WriteStream;

    expect(topicOptionsPerPage(output, topicPromptChoicesForTest().length)).toBe(10);
  });

  it("keeps decorated wizard output on the main screen so scrollback works", async () => {
    const { runtime, write } = scriptedRuntime({ hosts: ["codex"], confirm: true }, { decorated: true });

    await runInitWizard("/tmp/wiki", runtime);

    expect(write.mock.calls.join("\n")).not.toContain(ENTER_ALTERNATE_SCREEN);
    expect(write.mock.calls.join("\n")).not.toContain(EXIT_ALTERNATE_SCREEN);
    expect(write.mock.calls.join("\n")).toContain("LLM Wiki init preview");
  });

  it("keeps canceled decorated wizard output on the main screen", async () => {
    const { runtime, write } = scriptedRuntime({ hosts: ["codex"], confirm: false }, { decorated: true });

    await expect(runInitWizard("/tmp/wiki", runtime)).rejects.toBeInstanceOf(HostSelectionCanceledError);

    expect(write.mock.calls.join("\n")).not.toContain(ENTER_ALTERNATE_SCREEN);
    expect(write.mock.calls.join("\n")).not.toContain(EXIT_ALTERNATE_SCREEN);
  });

  it("does not emit terminal screen control codes for undecorated scripted output", async () => {
    const { runtime, write } = scriptedRuntime({ hosts: ["codex"], confirm: true });

    await runInitWizard("/tmp/wiki", runtime);

    expect(write.mock.calls.join("\n")).not.toContain(ENTER_ALTERNATE_SCREEN);
    expect(write.mock.calls.join("\n")).not.toContain(EXIT_ALTERNATE_SCREEN);
  });

  it("returns a plan after host selection and confirmation", async () => {
    const { runtime, write } = scriptedRuntime({ hosts: ["claude-code"], topic: "product-builder", confirm: true });

    const plan = await runInitWizard("/tmp/wiki", runtime);

    expect(plan.hosts).toEqual(["claude-code"]);
    expect(plan.topic.id).toBe("product-builder");
    expect(write.mock.calls.join("\n")).toContain("LLM Wiki init preview");
    expect(write.mock.calls.join("\n")).toContain("Product builder");
  });

  it("uses a fixed topic when command-line topic options were already provided", async () => {
    const { runtime, write } = scriptedRuntime({ hosts: ["codex"], topic: "finance", confirm: true });

    const plan = await runInitWizard("/tmp/wiki", runtime, {
      id: "trip-plan",
      scaffoldId: "trip-plan",
      label: "Trip plan"
    });

    expect(plan.topic.id).toBe("trip-plan");
    expect(write.mock.calls.join("\n")).toContain("Trip plan");
    expect(write.mock.calls.join("\n")).not.toContain("Finance");
  });

  it("cancels before writing when host selection is canceled", async () => {
    const { runtime } = scriptedRuntime({ cancel: "hosts" });

    await expect(runInitWizard("/tmp/wiki", runtime)).rejects.toBeInstanceOf(HostSelectionCanceledError);
  });

  it("cancels before writing when preview confirmation is rejected", async () => {
    const { runtime } = scriptedRuntime({ hosts: ["codex"], confirm: false });

    await expect(runInitWizard("/tmp/wiki", runtime)).rejects.toBeInstanceOf(HostSelectionCanceledError);
  });

  it("cancels before writing when topic selection is canceled", async () => {
    const { runtime } = scriptedRuntime({ hosts: ["codex"], cancel: "topic" });

    await expect(runInitWizard("/tmp/wiki", runtime)).rejects.toBeInstanceOf(HostSelectionCanceledError);
  });
});

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function scriptedRuntime(
  script: Parameters<typeof createScriptedPromptRuntime>[0],
  options: { decorated?: boolean } = {}
): {
  runtime: ReturnType<typeof createScriptedPromptRuntime>;
  write: ReturnType<typeof vi.fn>;
} {
  const write = vi.fn();
  return {
    runtime: createScriptedPromptRuntime(script, { output: { write } as unknown as NodeJS.WriteStream, decorated: options.decorated }),
    write
  };
}

function topicPromptChoicesForTest(): Array<{ name: (typeof TOPIC_TEMPLATE_IDS)[number] | "custom"; message: string; hint: string; enabled?: boolean }> {
  return [
    ...TOPIC_TEMPLATE_IDS.map((name, index) => ({
      name,
      message: getTopicTemplate(name).label,
      hint: getTopicTemplate(name).description,
      enabled: index === 0
    })),
    {
      name: "custom" as const,
      message: "Custom topic",
      hint: "Use the general scaffold and print an LLM handoff prompt"
    }
  ];
}

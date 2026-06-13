import { describe, expect, it } from "vitest";
import { upsertManagedBlock } from "../src/core/managed-block.js";

describe("managed block", () => {
  const block = { name: "obsidian", content: ".obsidian/workspace.json\n.obsidian/cache/" };

  it("creates a block in an empty file", () => {
    expect(upsertManagedBlock(undefined, block)).toEqual({
      status: "created",
      content: "# llm-wiki-skills: obsidian start\n.obsidian/workspace.json\n.obsidian/cache/\n# llm-wiki-skills: obsidian end\n"
    });
  });

  it("preserves existing unrelated content", () => {
    expect(upsertManagedBlock("node_modules/\ndist/\n", block)).toEqual({
      status: "updated",
      content:
        "node_modules/\ndist/\n\n# llm-wiki-skills: obsidian start\n.obsidian/workspace.json\n.obsidian/cache/\n# llm-wiki-skills: obsidian end\n"
    });
  });

  it("adds a missing newline before appending the block", () => {
    expect(upsertManagedBlock("node_modules/", block).content).toBe(
      "node_modules/\n\n# llm-wiki-skills: obsidian start\n.obsidian/workspace.json\n.obsidian/cache/\n# llm-wiki-skills: obsidian end\n"
    );
  });

  it("skips an already current managed block", () => {
    const content = "node_modules/\n\n# llm-wiki-skills: obsidian start\n.obsidian/workspace.json\n.obsidian/cache/\n# llm-wiki-skills: obsidian end\n";

    expect(upsertManagedBlock(content, block)).toEqual({ status: "skipped", content });
  });

  it("updates an old managed block without touching surrounding content", () => {
    const existing = "node_modules/\n\n# llm-wiki-skills: obsidian start\n.obsidian/workspace.json\n# llm-wiki-skills: obsidian end\n\ndist/\n";

    expect(upsertManagedBlock(existing, block)).toEqual({
      status: "updated",
      content:
        "node_modules/\n\n# llm-wiki-skills: obsidian start\n.obsidian/workspace.json\n.obsidian/cache/\n# llm-wiki-skills: obsidian end\n\ndist/\n"
    });
  });
});

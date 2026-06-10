import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execaNode } from "./helpers/process.js";
import { describe, expect, it } from "vitest";

describe("cli", () => {
  it("initializes an empty vault and reports health", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-init-"));
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--quiet"], {
      LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z"
    });
    const graphJson = JSON.parse(await readFile(path.join(root, "wiki/graph.json"), "utf8"));
    expect(graphJson.metadata.llmWikiGraphVersion).toBe(1);
    expect(graphJson.nodes).toEqual([]);
    expect(graphJson.edges).toEqual([]);
    const codexSkill = await readFile(path.join(root, ".codex/skills/llm-wiki/SKILL.md"), "utf8");
    expect(codexSkill).toContain("### wiki-ingest");
    expect(codexSkill).toContain("### wiki-query");
    const health = await execaNode(["dist/cli/index.js", "health", "--root", root, "--json"], {
      LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z"
    });
    expect(JSON.parse(health.stdout).status).toBe("pass");
  });

  it("does not overwrite existing vault files on init", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-existing-"));
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--quiet"]);
    await writeFile(path.join(root, "wiki/overview.md"), "custom overview\n", "utf8");
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--quiet"]);
    await expect(readFile(path.join(root, "wiki/overview.md"), "utf8")).resolves.toBe("custom overview\n");
  });

  it("returns a stable broken link error", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-broken-"));
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--quiet"]);
    await writeFile(path.join(root, "wiki/topics/broken.md"), "---\ntype: topic\nstatus: draft\nsources: []\n---\n[[missing]]\n", "utf8");
    const result = await execaNode(["dist/cli/index.js", "lint", "--root", root], {}, false);
    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain("BrokenLinkError");
  });

  it("checks graph drift without treating generatedAt as drift", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-graph-"));
    await execaNode(["dist/cli/index.js", "init", "--root", root, "--quiet"], {
      LLM_WIKI_SKILLS_NOW: "2026-06-10T00:00:00.000Z"
    });
    const result = await execaNode(["dist/cli/index.js", "graph", "--root", root, "--check"], {
      LLM_WIKI_SKILLS_NOW: "2026-06-11T00:00:00.000Z"
    });
    expect(result.stdout).toContain("Graph check passed");
  });
});

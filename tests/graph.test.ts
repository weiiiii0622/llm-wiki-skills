import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph, loadWikiPages, renderGraphMarkdown, writeGraphFiles } from "../src/core/graph.js";

describe("graph", () => {
  it("builds deterministic graph sidecars from the demo vault", async () => {
    process.env.LLM_WIKI_SKILLS_NOW = "2026-06-10T00:00:00.000Z";
    const root = await copyDemoVault();
    const graph = await writeGraphFiles(root);
    expect(graph.metadata.llmWikiGraphVersion).toBe(1);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "sources/package-plan",
      "topics/graph-first-vault"
    ]);
    expect(graph.edges.some((edge) => edge.source === "topics/graph-first-vault" && edge.target === "sources/package-plan")).toBe(true);
    expect(renderGraphMarkdown(graph)).toContain("| [[topics/graph-first-vault]] | [[sources/package-plan]] | 5.50 |");
    delete process.env.LLM_WIKI_SKILLS_NOW;
  });

  it("builds 10,000 explicit relationships without pairwise tag expansion", () => {
    const pages = Array.from({ length: 10_000 }, (_, index) => ({
      id: `topics/page-${index}`,
      path: `wiki/topics/page-${index}.md`,
      title: `Page ${index}`,
      slug: `page-${index}`,
      frontmatter: { type: "topic", status: "draft" },
      body: "",
      wikilinks: index === 0 ? [] : [`topics/page-${index - 1}`],
      sources: [],
      tags: ["shared"]
    }));
    const graph = buildGraph(pages);
    expect(graph.nodes).toHaveLength(10_000);
    expect(graph.edges).toHaveLength(9_999);
  });

  it("loads wiki pages excluding generated graph markdown", async () => {
    const root = await copyDemoVault();
    await writeGraphFiles(root);
    const pages = await loadWikiPages(root);
    expect(pages.some((page) => page.id === "graph")).toBe(false);
  });
});

async function copyDemoVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-demo-"));
  await cp(path.resolve("fixtures/demo-vault"), root, { recursive: true });
  return root;
}

import { cp, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDiagnostics, deterministicLayout, exportAtlas, markdownToSafeHtml } from "../src/core/web-export.js";
import { buildGraph, loadWikiPages } from "../src/core/graph.js";

describe("web export", () => {
  it("exports a deployable graph atlas with manifest, split content, diagnostics, and search index", async () => {
    process.env.LLM_WIKI_SKILLS_NOW = "2026-06-18T00:00:00.000Z";
    const root = await copyDemoVault();
    const out = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-atlas-"));

    const result = await exportAtlas(root, out);

    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBeGreaterThan(0);
    expect(await stat(path.join(out, "index.html"))).toBeTruthy();
    expect(await stat(path.join(out, "assets/app.css"))).toBeTruthy();
    const manifest = JSON.parse(await readFile(path.join(out, "atlas/manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      stats: { nodes: 2, pages: 2 },
      files: { graph: "atlas/graph.json", searchIndex: "atlas/search-index.json" }
    });
    expect(manifest.pages[0].content).toMatch(/^atlas\/pages\//);
    const page = JSON.parse(await readFile(path.join(out, manifest.pages[0].content), "utf8"));
    expect(page.html).toContain("<p>");
    const graph = JSON.parse(await readFile(path.join(out, "atlas/graph.json"), "utf8"));
    expect(graph.layout["topics/graph-first-vault"]).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    const audit = await readFile(path.join(out, "atlas/audit.md"), "utf8");
    expect(audit).toContain("## Included Pages");
    delete process.env.LLM_WIKI_SKILLS_NOW;
  });

  it("sanitizes unsafe markdown while preserving graph-aware wikilinks", () => {
    const html = markdownToSafeHtml("## Title\n\n<script>alert(1)</script>\n\n[[topics/graph-first-vault|Graph note]]", [
      {
        id: "topics/graph-first-vault",
        path: "wiki/topics/graph-first-vault.md",
        title: "Graph First Vault",
        type: "topic",
        status: "draft",
        tags: []
      }
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('data-node-id="topics/graph-first-vault"');
  });

  it("reports unresolved links, orphans, draft, private, and weak regions", async () => {
    const root = await copyDemoVault();
    await writeFile(
      path.join(root, "wiki/topics/private-draft.md"),
      "---\ntype: topic\nstatus: draft-private\ntags: [confidential]\n---\n\n[[missing-note]]\n",
      "utf8"
    );
    const pages = await loadWikiPages(root);
    const diagnostics = buildDiagnostics(pages, buildGraph(pages));
    expect(diagnostics.unresolvedLinks).toContainEqual({ source: "topics/private-draft", target: "missing-note" });
    expect(diagnostics.draftPages).toContain("topics/private-draft");
    expect(diagnostics.privatePages).toContain("topics/private-draft");
    expect(diagnostics.orphans).toContain("topics/private-draft");
    expect(diagnostics.weakRegions.length).toBeGreaterThan(0);
  });

  it("computes stable deterministic layout positions", async () => {
    const root = await copyDemoVault();
    const graph = buildGraph(await loadWikiPages(root));
    expect(deterministicLayout(graph.nodes, graph.edges)).toEqual(deterministicLayout(graph.nodes, graph.edges));
  });
});

async function copyDemoVault(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "llm-wiki-demo-"));
  await cp(path.resolve("fixtures/demo-vault"), root, { recursive: true });
  return root;
}

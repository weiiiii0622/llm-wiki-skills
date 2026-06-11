import path from "node:path";
import { readText, listMarkdownFiles, stableJson, atomicWriteText } from "./fs.js";
import { extractFrontmatter, extractWikilinks, frontmatterArray, pageIdFromPath, slugify, titleFromPath } from "./markdown.js";
import type { GraphEdge, WikiGraph, WikiPage } from "./types.js";

export const PACKAGE_VERSION = "0.1.2";

export async function loadWikiPages(root: string): Promise<WikiPage[]> {
  const files = (await listMarkdownFiles(root, "wiki")).filter((file) => file !== "wiki/graph.md");
  const pages: WikiPage[] = [];
  for (const file of files) {
    const markdown = await readText(path.join(root, file));
    const { frontmatter, body } = extractFrontmatter(markdown, file);
    const id = pageIdFromPath(file);
    const title = titleFromPath(file);
    const frontmatterLinks = frontmatterArray(frontmatter.sources).flatMap((source) => extractWikilinks(source));
    pages.push({
      id,
      path: file,
      title,
      slug: slugify(title),
      frontmatter,
      body,
      wikilinks: extractWikilinks(body),
      sources: frontmatterLinks,
      tags: frontmatterArray(frontmatter.tags)
    });
  }
  return pages.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildGraph(pages: WikiPage[]): WikiGraph {
  const graphPages = pages.filter(isGraphNodePage);
  const resolver = createResolver(graphPages);
  const edgeMap = new Map<string, GraphEdge>();
  for (const page of graphPages) {
    for (const target of page.wikilinks) {
      addEdge(edgeMap, page.id, resolver(target), 3, "direct-wikilink", target);
    }
    for (const target of page.sources) {
      addEdge(edgeMap, page.id, resolver(target), 2.5, "frontmatter-source", target);
    }
  }
  return {
    metadata: {
      llmWikiGraphVersion: 1,
      createdBy: `llm-wiki-skills@${PACKAGE_VERSION}`,
      scoringRubricVersion: 1,
      generatedAt: process.env.LLM_WIKI_SKILLS_NOW ?? new Date().toISOString()
    },
    nodes: graphPages.map((page) => ({
      id: page.id,
      path: page.path,
      title: page.title,
      type: stringField(page.frontmatter.type, "unknown"),
      status: stringField(page.frontmatter.status, "unknown"),
      tags: page.tags
    })),
    edges: [...edgeMap.values()].sort((a, b) => `${a.source}\0${a.target}`.localeCompare(`${b.source}\0${b.target}`))
  };
}

export function isGraphNodePage(page: WikiPage): boolean {
  const type = stringField(page.frontmatter.type, "");
  if (["index", "log", "overview", "template"].includes(type)) return false;
  if (page.id.startsWith("templates/")) return false;
  return true;
}

export async function writeGraphFiles(root: string): Promise<WikiGraph> {
  const graph = buildGraph(await loadWikiPages(root));
  await atomicWriteText(root, "wiki/graph.json", stableJson(graph));
  await atomicWriteText(root, "wiki/graph.md", renderGraphMarkdown(graph));
  return graph;
}

export function renderGraphMarkdown(graph: WikiGraph): string {
  const lines = [
    "---",
    "llmWikiGraphVersion: 1",
    `createdBy: ${graph.metadata.createdBy}`,
    "scoringRubricVersion: 1",
    "---",
    "# Wiki Graph",
    "",
    `Generated: ${graph.metadata.generatedAt}`,
    "",
    "## Nodes",
    "",
    "| Node | Type | Status | Tags |",
    "| --- | --- | --- | --- |"
  ];
  for (const node of graph.nodes) {
    lines.push(`| [[${node.id}]] | ${node.type} | ${node.status} | ${node.tags.join(", ")} |`);
  }
  lines.push("", "## Edges", "", "| Source | Target | Weight | Reasons |", "| --- | --- | ---: | --- |");
  for (const edge of graph.edges) {
    lines.push(`| [[${edge.source}]] | [[${edge.target}]] | ${edge.weight.toFixed(2)} | ${edge.reasons.join("; ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function graphJson(graph: WikiGraph): string {
  return stableJson(graph);
}

function createResolver(pages: WikiPage[]): (target: string) => string | undefined {
  const byId = new Map(pages.map((page) => [page.id, page.id]));
  const byBasename = new Map(pages.map((page) => [path.posix.basename(page.id), page.id]));
  const bySlug = new Map(pages.map((page) => [page.slug, page.id]));
  return (target: string) => {
    const normalized = target.replace(/\.md$/, "").replace(/^wiki\//, "");
    return byId.get(normalized) ?? byBasename.get(normalized) ?? bySlug.get(slugify(normalized));
  };
}

function addEdge(
  edgeMap: Map<string, GraphEdge>,
  source: string,
  target: string | undefined,
  weight: number,
  reason: string,
  rawTarget: string
): void {
  if (!target || target === source) return;
  const key = `${source}\0${target}`;
  const existing = edgeMap.get(key);
  const label = `${reason}:${rawTarget}`;
  if (existing) {
    existing.weight += weight;
    existing.reasons.push(label);
  } else {
    edgeMap.set(key, { source, target, weight, reasons: [label] });
  }
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

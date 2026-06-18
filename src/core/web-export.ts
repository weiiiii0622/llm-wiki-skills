import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PackageAssetMissingError } from "./errors.js";
import { pathExists, readText, stableJson } from "./fs.js";
import { buildGraph, loadWikiPages } from "./graph.js";
import { extractWikilinks, pageIdFromPath, slugify } from "./markdown.js";
import { loadManifest } from "./manifest.js";
import type { GraphEdge, GraphNode, WikiGraph, WikiPage } from "./types.js";

export const ATLAS_SCHEMA_VERSION = 1;

export interface AtlasManifest {
  schemaVersion: 1;
  title: string;
  generatedAt: string;
  createdBy: string;
  qmd: {
    available: boolean;
    mode: "disabled" | "keyword" | "hybrid";
  };
  stats: {
    nodes: number;
    edges: number;
    pages: number;
    warnings: number;
  };
  files: {
    graph: string;
    searchIndex: string;
    diagnostics: string;
    audit: string;
  };
  pages: AtlasPageIndexItem[];
  warnings: string[];
}

export interface AtlasPageIndexItem {
  id: string;
  title: string;
  path: string;
  type: string;
  status: string;
  tags: string[];
  content: string;
}

export interface AtlasGraph extends WikiGraph {
  layout: Record<string, AtlasPoint>;
}

export interface AtlasPoint {
  x: number;
  y: number;
}

export interface AtlasDiagnostics {
  unresolvedLinks: AtlasLinkWarning[];
  orphans: string[];
  draftPages: string[];
  privatePages: string[];
  weakRegions: string[][];
  warnings: string[];
}

export interface AtlasLinkWarning {
  source: string;
  target: string;
}

export interface AtlasSearchDocument {
  id: string;
  title: string;
  path: string;
  type: string;
  status: string;
  tags: string[];
  text: string;
}

export interface AtlasExportResult {
  root: string;
  outDir: string;
  manifestPath: string;
  pageCount: number;
  nodeCount: number;
  edgeCount: number;
  warningCount: number;
}

export interface AtlasPageContent {
  id: string;
  title: string;
  path: string;
  metadata: {
    type: string;
    status: string;
    tags: string[];
  };
  html: string;
  wikilinks: string[];
  backlinks: string[];
}

export async function exportAtlas(root: string, outDir: string): Promise<AtlasExportResult> {
  const resolvedRoot = path.resolve(root);
  const resolvedOut = path.resolve(outDir);
  const pages = await loadWikiPages(resolvedRoot);
  const graph = buildGraph(pages);
  const diagnostics = buildDiagnostics(pages, graph);
  const manifestMetadata = await qmdMetadata(resolvedRoot);
  const pageItems = graph.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    path: node.path,
    type: node.type,
    status: node.status,
    tags: node.tags,
    content: pageContentPath(node.id)
  }));
  const manifest: AtlasManifest = {
    schemaVersion: ATLAS_SCHEMA_VERSION,
    title: path.basename(resolvedRoot),
    generatedAt: graph.metadata.generatedAt,
    createdBy: graph.metadata.createdBy,
    qmd: manifestMetadata,
    stats: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      pages: pageItems.length,
      warnings: diagnostics.warnings.length
    },
    files: {
      graph: "atlas/graph.json",
      searchIndex: "atlas/search-index.json",
      diagnostics: "atlas/diagnostics.json",
      audit: "atlas/audit.md"
    },
    pages: pageItems,
    warnings: diagnostics.warnings
  };
  const atlasGraph: AtlasGraph = { ...graph, layout: deterministicLayout(graph.nodes, graph.edges) };
  const searchIndex = buildSearchIndex(pages, graph.nodes);

  await rm(resolvedOut, { recursive: true, force: true });
  await mkdir(path.join(resolvedOut, "atlas/pages"), { recursive: true });
  await copyViewerAssets(resolvedOut);
  await writeFile(path.join(resolvedOut, "atlas/manifest.json"), stableJson(manifest), "utf8");
  await writeFile(path.join(resolvedOut, "atlas/graph.json"), stableJson(atlasGraph), "utf8");
  await writeFile(path.join(resolvedOut, "atlas/diagnostics.json"), stableJson(diagnostics), "utf8");
  await writeFile(path.join(resolvedOut, "atlas/search-index.json"), stableJson(searchIndex), "utf8");
  await writeFile(path.join(resolvedOut, "atlas/audit.md"), renderAudit(manifest, diagnostics), "utf8");

  const pageById = new Map(pages.map((page) => [page.id, page]));
  for (const node of graph.nodes) {
    const page = pageById.get(node.id);
    if (!page) continue;
    const content = renderPageContent(page, node, graph);
    await writeFile(path.join(resolvedOut, pageContentPath(node.id)), stableJson(content), "utf8");
  }

  return {
    root: resolvedRoot,
    outDir: resolvedOut,
    manifestPath: path.join(resolvedOut, "atlas/manifest.json"),
    pageCount: pageItems.length,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    warningCount: diagnostics.warnings.length
  };
}

export function buildSearchIndex(pages: WikiPage[], nodes: GraphNode[]): AtlasSearchDocument[] {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  return nodes.map((node) => {
    const page = pageById.get(node.id);
    const text = normalizeSearchText(`${node.title}\n${node.type}\n${node.status}\n${node.tags.join(" ")}\n${page?.body ?? ""}`);
    return {
      id: node.id,
      title: node.title,
      path: node.path,
      type: node.type,
      status: node.status,
      tags: node.tags,
      text
    };
  });
}

export function buildDiagnostics(pages: WikiPage[], graph: WikiGraph): AtlasDiagnostics {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const nodes = new Set(graph.nodes.map((node) => node.id));
  const resolvedAliases = new Map<string, string>();
  for (const page of pages) {
    if (!nodes.has(page.id)) continue;
    resolvedAliases.set(page.id, page.id);
    resolvedAliases.set(path.posix.basename(page.id), page.id);
    resolvedAliases.set(slugify(page.title), page.id);
  }
  const unresolvedLinks: AtlasLinkWarning[] = [];
  for (const node of graph.nodes) {
    const page = pageById.get(node.id);
    if (!page) continue;
    for (const target of [...page.wikilinks, ...page.sources]) {
      const normalized = target.replace(/\.md$/, "").replace(/^wiki\//, "");
      if (!resolvedAliases.has(normalized) && !resolvedAliases.has(path.posix.basename(normalized)) && !resolvedAliases.has(slugify(normalized))) {
        unresolvedLinks.push({ source: node.id, target });
      }
    }
  }
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  const orphans = graph.nodes.map((node) => node.id).filter((id) => !connected.has(id)).sort();
  const draftPages = graph.nodes.filter((node) => /draft|wip/i.test(node.status)).map((node) => node.id).sort();
  const privatePages = graph.nodes
    .filter((node) => /private|secret|confidential/i.test(`${node.status} ${node.tags.join(" ")}`))
    .map((node) => node.id)
    .sort();
  const weakRegions = connectedRegions(graph).filter((region) => region.length > 0 && region.length < graph.nodes.length).sort((a, b) => a[0].localeCompare(b[0]));
  const warnings = [
    ...unresolvedLinks.map((link) => `Unresolved link from ${link.source} to ${link.target}.`),
    ...orphans.map((id) => `Orphan page has no graph edges: ${id}.`),
    ...draftPages.map((id) => `Draft page included in export: ${id}.`),
    ...privatePages.map((id) => `Private/confidential page marker included in export: ${id}.`)
  ];
  return { unresolvedLinks, orphans, draftPages, privatePages, weakRegions, warnings };
}

export function deterministicLayout(nodes: GraphNode[], edges: GraphEdge[]): Record<string, AtlasPoint> {
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const ordered = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const layout: Record<string, AtlasPoint> = {};
  const count = Math.max(ordered.length, 1);
  ordered.forEach((node, index) => {
    const degreeScore = degree.get(node.id) ?? 0;
    const angle = index * (Math.PI * (3 - Math.sqrt(5)));
    const radius = 80 + 420 * Math.sqrt((index + 0.5) / count) - Math.min(degreeScore, 12) * 10;
    layout[node.id] = {
      x: round(Math.cos(angle) * radius),
      y: round(Math.sin(angle) * radius)
    };
  });
  return layout;
}

export function renderPageContent(page: WikiPage, node: GraphNode, graph: WikiGraph): AtlasPageContent {
  const backlinks = graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source).sort();
  const outgoing = graph.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target).sort();
  return {
    id: node.id,
    title: node.title,
    path: node.path,
    metadata: {
      type: node.type,
      status: node.status,
      tags: node.tags
    },
    html: markdownToSafeHtml(page.body, graph.nodes),
    wikilinks: outgoing,
    backlinks
  };
}

export function markdownToSafeHtml(markdown: string, nodes: GraphNode[]): string {
  const nodeByName = new Map<string, string>();
  for (const node of nodes) {
    nodeByName.set(node.id, node.id);
    nodeByName.set(path.posix.basename(node.id), node.id);
    nodeByName.set(slugify(node.title), node.id);
  }
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let inCode = false;
  let code: string[] = [];

  function flushParagraph(): void {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "), nodeByName)}</p>`);
    paragraph = [];
  }
  function flushList(): void {
    if (list.length === 0) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item, nodeByName)}</li>`).join("")}</ul>`);
    list = [];
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${inlineMarkdown(heading[2], nodeByName)}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (inCode) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return html.join("\n");
}

export function pageContentPath(id: string): string {
  return `atlas/pages/${encodeURIComponent(id)}.json`;
}

function inlineMarkdown(value: string, nodeByName: Map<string, string>): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer" target="_blank">$1</a>')
    .replace(/\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|([^\]]+))?\]\]/g, (_match, rawTarget: string, rawLabel: string | undefined) => {
      const normalized = rawTarget.replace(/\.md$/, "").replace(/^wiki\//, "");
      const id = nodeByName.get(normalized) ?? nodeByName.get(path.posix.basename(normalized)) ?? nodeByName.get(slugify(normalized));
      const label = rawLabel ?? rawTarget;
      if (!id) return `<span class="missing-wikilink">${escapeHtml(label)}</span>`;
      return `<a href="#node=${encodeURIComponent(id)}" data-node-id="${escapeHtml(id)}">${escapeHtml(label)}</a>`;
    });
}

function renderAudit(manifest: AtlasManifest, diagnostics: AtlasDiagnostics): string {
  const lines = [
    "# Graph Atlas Export Audit",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Pages included: ${manifest.stats.pages}`,
    `Nodes: ${manifest.stats.nodes}`,
    `Edges: ${manifest.stats.edges}`,
    `qmd search: ${manifest.qmd.available ? manifest.qmd.mode : "disabled"}`,
    "",
    "## Included Pages",
    "",
    ...manifest.pages.map((page) => `- ${page.path} (${page.type}, ${page.status})`),
    "",
    "## Warnings",
    ""
  ];
  if (diagnostics.warnings.length === 0) {
    lines.push("- No export warnings.");
  } else {
    lines.push(...diagnostics.warnings.map((warning) => `- ${warning}`));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function copyViewerAssets(outDir: string): Promise<void> {
  const assetDir = await viewerAssetDir();
  await cp(path.join(assetDir, "index.html"), path.join(outDir, "index.html"));
  await mkdir(path.join(outDir, "assets"), { recursive: true });
  await cp(path.join(assetDir, "assets"), path.join(outDir, "assets"), { recursive: true });
}

async function viewerAssetDir(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../web-viewer"), path.resolve(here, "../../src/web-viewer")];
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "index.html"))) return candidate;
  }
  throw new PackageAssetMissingError("Graph atlas viewer assets are missing. Run `npm run build` before using `web build`.");
}

async function qmdMetadata(root: string): Promise<AtlasManifest["qmd"]> {
  try {
    const manifest = await loadManifest(root);
    const qmd = manifest.integrations?.qmd;
    if (!qmd?.enabled) return { available: false, mode: "disabled" };
    return { available: true, mode: qmd.searchMode };
  } catch {
    return { available: false, mode: "disabled" };
  }
}

function connectedRegions(graph: WikiGraph): string[][] {
  const neighbors = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  const seen = new Set<string>();
  const regions: string[][] = [];
  for (const node of graph.nodes) {
    if (seen.has(node.id)) continue;
    const region: string[] = [];
    const queue = [node.id];
    seen.add(node.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      region.push(id);
      for (const next of neighbors.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    regions.push(region.sort());
  }
  return regions;
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/---[\s\S]*?---/, " ")
    .replace(/\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|([^\]]+))?\]\]/g, "$1 $2")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

import path from "node:path";
import { readText, pathExists } from "./fs.js";
import { buildGraph, graphJson, loadWikiPages, renderGraphMarkdown } from "./graph.js";
import { frontmatterArray, slugify } from "./markdown.js";
import type { ValidationIssue, WikiPage } from "./types.js";

export async function validateVault(root: string): Promise<{ pages: WikiPage[]; issues: ValidationIssue[] }> {
  const pages = await loadWikiPages(root);
  const issues: ValidationIssue[] = [];
  const ids = new Set(pages.map((page) => page.id));
  const basenameToIds = new Map<string, string[]>();
  for (const page of pages) {
    const basename = path.posix.basename(page.id);
    basenameToIds.set(basename, [...(basenameToIds.get(basename) ?? []), page.id]);
  }
  const resolved = new Map<string, string>();
  for (const id of ids) resolved.set(id, id);
  for (const [basename, matches] of basenameToIds) {
    if (matches.length === 1) resolved.set(basename, matches[0]);
  }
  for (const page of pages) resolved.set(slugify(page.title), page.id);
  for (const page of pages) {
    validateFrontmatterShape(page, issues);
  }
  for (const page of pages) {
    for (const link of [...page.wikilinks, ...page.sources]) {
      const normalized = link.replace(/\.md$/, "").replace(/^wiki\//, "");
      if (!resolved.has(normalized) && !resolved.has(slugify(normalized))) {
        issues.push({
          code: "BrokenLinkError",
          severity: "error",
          path: page.path,
          message: `Broken wikilink [[${link}]] in ${page.path}`
        });
      }
    }
  }
  await validateGraphDrift(root, issues);
  return { pages, issues };
}

export function findOrphanPages(pages: WikiPage[]): string[] {
  const linked = new Set<string>();
  const byId = new Map(pages.map((page) => [page.id, page.id]));
  const byBase = new Map(pages.map((page) => [path.posix.basename(page.id), page.id]));
  const bySlug = new Map(pages.map((page) => [page.slug, page.id]));
  for (const page of pages) {
    for (const link of [...page.wikilinks, ...page.sources]) {
      const normalized = link.replace(/\.md$/, "").replace(/^wiki\//, "");
      const target = byId.get(normalized) ?? byBase.get(normalized) ?? bySlug.get(slugify(normalized));
      if (target) linked.add(target);
    }
  }
  return pages
    .filter((page) => !["index", "overview", "log"].includes(page.id))
    .filter((page) => !page.id.startsWith("templates/"))
    .filter((page) => !linked.has(page.id))
    .map((page) => page.path)
    .sort();
}

function validateFrontmatterShape(page: WikiPage, issues: ValidationIssue[]): void {
  const type = page.frontmatter.type;
  const status = page.frontmatter.status;
  if (typeof type !== "string" || type.length === 0) {
    issues.push({
      code: "InvalidFrontmatterError",
      severity: "error",
      path: page.path,
      message: `Missing string frontmatter field: type`
    });
  }
  if (typeof status !== "string" || status.length === 0) {
    issues.push({
      code: "InvalidFrontmatterError",
      severity: "error",
      path: page.path,
      message: `Missing string frontmatter field: status`
    });
  }
  if (!Array.isArray(page.frontmatter.sources) && page.frontmatter.sources !== undefined) {
    issues.push({
      code: "InvalidFrontmatterError",
      severity: "error",
      path: page.path,
      message: `Frontmatter sources must be a list`
    });
  }
  frontmatterArray(page.frontmatter.tags);
}

async function validateGraphDrift(root: string, issues: ValidationIssue[]): Promise<void> {
  const graph = buildGraph(await loadWikiPages(root));
  const graphJsonPath = path.join(root, "wiki/graph.json");
  const graphMdPath = path.join(root, "wiki/graph.md");
  if (await pathExists(graphJsonPath)) {
    const current = await readText(graphJsonPath);
    if (!sameGraphJson(current, graphJson(graph))) {
      issues.push({
        code: "GraphDriftError",
        severity: "warning",
        path: "wiki/graph.json",
        message: "wiki/graph.json differs from the current vault graph"
      });
    }
  }
  if (await pathExists(graphMdPath)) {
    const current = await readText(graphMdPath);
    if (!sameGraphMarkdown(current, renderGraphMarkdown(graph))) {
      issues.push({
        code: "GraphDriftError",
        severity: "warning",
        path: "wiki/graph.md",
        message: "wiki/graph.md differs from the current vault graph"
      });
    }
  }
}

export function sameGraphJson(left: string, right: string): boolean {
  try {
    const leftParsed = JSON.parse(left);
    const rightParsed = JSON.parse(right);
    delete leftParsed.metadata?.generatedAt;
    delete rightParsed.metadata?.generatedAt;
    return JSON.stringify(leftParsed) === JSON.stringify(rightParsed);
  } catch {
    return false;
  }
}

export function sameGraphMarkdown(left: string, right: string): boolean {
  return stripGeneratedLine(left) === stripGeneratedLine(right);
}

function stripGeneratedLine(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("Generated: "))
    .join("\n");
}

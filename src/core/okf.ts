import path from "node:path";
import type { OkfConformanceReport, ValidationIssue, WikiPage } from "./types.js";

export const OKF_VERSION = "0.1" as const;

export function isOkfReservedFile(pageOrPath: Pick<WikiPage, "path"> | string): boolean {
  const pagePath = typeof pageOrPath === "string" ? pageOrPath : pageOrPath.path;
  const basename = path.posix.basename(pagePath);
  return basename === "index.md" || basename === "log.md";
}

export function buildOkfConformance(pages: WikiPage[]): OkfConformanceReport {
  const issues: ValidationIssue[] = [];
  const reserved = pages.filter(isOkfReservedFile);
  const concepts = pages.filter((page) => !isOkfReservedFile(page));
  const rootIndex = pages.find((page) => page.path === "wiki/index.md");

  if (!rootIndex) {
    issues.push(okfIssue("wiki/index.md", "Missing OKF root index: wiki/index.md"));
  } else if (rootIndex.frontmatter.okf_version !== OKF_VERSION) {
    issues.push(okfIssue(rootIndex.path, `Root index must declare string okf_version: "${OKF_VERSION}"`));
  }

  for (const page of reserved) {
    if (path.posix.basename(page.path) === "log.md") validateLogPage(page, issues);
    if (page.path !== "wiki/index.md" && Object.keys(page.frontmatter).length > 0) {
      issues.push(okfIssue(page.path, "Reserved nested index.md/log.md files must not use concept frontmatter"));
    }
  }

  for (const page of concepts) {
    requireString(page, "type", issues);
    requireString(page, "title", issues);
    requireString(page, "description", issues);
    requireString(page, "timestamp", issues);
  }

  return {
    version: OKF_VERSION,
    status: issues.some((issue) => issue.severity === "error") ? "fail" : "pass",
    pageCount: pages.length,
    conceptPageCount: concepts.length,
    reservedFileCount: reserved.length,
    issueCount: issues.length,
    issues
  };
}

function validateLogPage(page: WikiPage, issues: ValidationIssue[]): void {
  if (Object.keys(page.frontmatter).length > 0) {
    issues.push(okfIssue(page.path, "OKF log.md must not have frontmatter"));
  }
  const headings = page.body.match(/^##\s+.+$/gm) ?? [];
  for (const heading of headings) {
    if (!/^##\s+\d{4}-\d{2}-\d{2}$/.test(heading)) {
      issues.push(okfIssue(page.path, `OKF log heading must use ## YYYY-MM-DD: ${heading}`));
    }
  }
}

function requireString(page: WikiPage, field: string, issues: ValidationIssue[]): void {
  const value = page.frontmatter[field];
  if (typeof value !== "string" || value.length === 0) {
    issues.push(okfIssue(page.path, `OKF concept page requires string frontmatter field: ${field}`));
  }
}

function okfIssue(pathValue: string, message: string): ValidationIssue {
  return {
    code: "OkfConformanceError",
    severity: "error",
    path: pathValue,
    message
  };
}

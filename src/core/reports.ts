import type { HealthReport, StatusReport, ValidationIssue, WikiGraph, WikiPage } from "./types.js";

export function renderInitReport(results: Record<string, "created" | "skipped">): string {
  const created = Object.entries(results).filter(([, status]) => status === "created").length;
  const skipped = Object.entries(results).filter(([, status]) => status === "skipped").length;
  return `Initialized llm-wiki local skills.\nCreated: ${created}\nSkipped existing paths: ${skipped}\nNext: run \`npx llm-wiki-skills status\`.\n`;
}

export function renderStatusReport(report: StatusReport): string {
  return [
    `Status: ${report.status.toUpperCase()}`,
    `Root: ${report.root}`,
    `Manifest: ${report.manifestPath}`,
    `Hosts: ${report.hosts.join(", ")}`,
    `Topic: ${report.topic?.id ?? "unknown"}`,
    `Checked files: ${report.checkedFiles.length}`,
    ""
  ].join("\n");
}

export function buildHealthReport(root: string, pages: WikiPage[], issues: ValidationIssue[]): HealthReport {
  const countsByType: Record<string, number> = {};
  const countsByStatus: Record<string, number> = {};
  for (const page of pages) {
    const type = typeof page.frontmatter.type === "string" ? page.frontmatter.type : "unknown";
    const status = typeof page.frontmatter.status === "string" ? page.frontmatter.status : "unknown";
    countsByType[type] = (countsByType[type] ?? 0) + 1;
    countsByStatus[status] = (countsByStatus[status] ?? 0) + 1;
  }
  return {
    status: issues.some((issue) => issue.severity === "error") ? "fail" : "pass",
    root,
    pageCount: pages.length,
    countsByType: sortRecord(countsByType),
    countsByStatus: sortRecord(countsByStatus),
    orphanPages: [],
    issues
  };
}

export function renderHealthReport(report: HealthReport): string {
  const lines = [
    `Vault health: ${report.status.toUpperCase()}`,
    `Root: ${report.root}`,
    `Pages: ${report.pageCount}`,
    "",
    "Types:",
    ...recordLines(report.countsByType),
    "",
    "Statuses:",
    ...recordLines(report.countsByStatus),
    "",
    `Orphans: ${report.orphanPages.length}`
  ];
  for (const orphan of report.orphanPages) lines.push(`- ${orphan}`);
  lines.push("", `Issues: ${report.issues.length}`);
  for (const issue of report.issues) {
    lines.push(`- ${issue.severity.toUpperCase()} ${issue.code}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderLintReport(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "Lint passed: no issues found.\n";
  return `${issues.length} issue(s) found:\n${issues
    .map((issue) => `- ${issue.severity.toUpperCase()} ${issue.code}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}`)
    .join("\n")}\n`;
}

export function renderGraphSummary(graph: WikiGraph): string {
  return `Graph written.\nNodes: ${graph.nodes.length}\nEdges: ${graph.edges.length}\n`;
}

function recordLines(record: Record<string, number>): string[] {
  const entries = Object.entries(record);
  if (entries.length === 0) return ["- none"];
  return entries.map(([key, value]) => `- ${key}: ${value}`);
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

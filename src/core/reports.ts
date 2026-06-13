import type { HealthReport, InitWriteStatus, StatusReport, ValidationIssue, WikiGraph, WikiPage } from "./types.js";

export function renderInitReport(results: Record<string, InitWriteStatus>, obsidianHandoff?: string): string {
  const entries = Object.entries(results).sort(([a], [b]) => a.localeCompare(b));
  const created = entries.filter(([, status]) => status === "created");
  const updated = entries.filter(([, status]) => status === "updated");
  const skipped = entries.filter(([, status]) => status === "skipped");
  const setup = setupSummary(entries);
  return [
    "◆ LLM Wiki is ready.",
    "",
    `● Changed: ${countLabel(created.length, "created")}, ${countLabel(updated.length, "updated")}, ${countLabel(skipped.length, "left alone")}.`,
    "",
    setup.length > 0 ? "✓ Set up" : undefined,
    ...setup.map((line) => `  • ${line}`),
    skipped.length > 0 ? "" : undefined,
    skipped.length > 0 ? "○ Left alone" : undefined,
    ...skipped.map(([file]) => `  • ${file}`),
    updated.length > 0 ? "" : undefined,
    updated.length > 0 ? "↻ Updated" : undefined,
    ...updated.map(([file]) => `  • ${file}`),
    obsidianHandoff ? "" : undefined,
    obsidianHandoff ? "◇ Obsidian" : undefined,
    obsidianHandoff ? `  ${formatObsidianHandoff(obsidianHandoff)}` : undefined,
    "",
    "→ Next",
    "  npx llm-wiki-skills status"
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")
    .concat("\n");
}

export function renderStatusReport(report: StatusReport): string {
  return [
    `Status: ${report.status.toUpperCase()}`,
    `Root: ${report.root}`,
    `Manifest: ${report.manifestPath}`,
    `Hosts: ${report.hosts.join(", ")}`,
    `Topic: ${report.topic?.id ?? "unknown"}`,
    `Obsidian: ${report.integrations?.obsidian?.enabled ? "enabled" : "not configured"}`,
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

function countLabel(count: number, label: string): string {
  return `${count} ${label}`;
}

function setupSummary(entries: Array<[string, InitWriteStatus]>): string[] {
  const paths = entries.filter(([, status]) => status !== "skipped").map(([file]) => file);
  const lines: string[] = [];
  if (paths.some((file) => file.startsWith(".agents/skills/") || file.startsWith(".claude/skills/"))) lines.push("Agent skills");
  if (paths.some((file) => file.startsWith("wiki/") || file === "docs/llm-wiki-routing.md")) lines.push("Wiki pages and topic folders");
  if (paths.some((file) => file === "docs/llm-wiki-contract.md" || file === "docs/llm-wiki-workflows.md")) lines.push("Reference docs");
  if (paths.some((file) => file.startsWith(".obsidian/"))) lines.push("Obsidian vault settings");
  if (paths.includes(".gitignore")) lines.push(".gitignore runtime rules");
  if (paths.includes(".llm-wiki-skills.json")) lines.push("Install manifest");
  return lines;
}

function formatObsidianHandoff(value: string): string {
  return value.replace(/^Obsidian:\s*/, "");
}

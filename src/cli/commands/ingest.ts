import path from "node:path";
import type { CommandOptions } from "../../core/types.js";
import { printResult } from "../format.js";
import {
  createIngestPlan,
  getIngestStatus,
  importExtractorReport,
  markIngestSource,
  validateIngestPlan,
  type IngestCommandResult
} from "../../core/ingest/index.js";
import { markerProviderStatus, type ConversionStatus } from "../../core/ingest/converters.js";

export async function ingestCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  if (options.ingestAction === "plan") {
    const result = await createIngestPlan(root, options.ingestRawRoots, {
      enabled: options.ingestConvert ?? true,
      converter: options.ingestConverter ?? "marker",
      ...(options.ingestConversionWorkers === undefined ? {} : { workers: options.ingestConversionWorkers }),
      ...(options.ingestConversionTimeoutMs === undefined ? {} : { timeoutMs: options.ingestConversionTimeoutMs }),
      ...(options.ingestConversionMaxMb === undefined ? {} : { maxMb: options.ingestConversionMaxMb }),
      ...(options.json || options.quiet ? {} : { log: writeGreyToolLog })
    });
    printResult(result, options.json, options.quiet, renderIngestResult("planned", result));
    return;
  }
  if (options.ingestAction === "converters-status") {
    const status = await markerProviderStatus();
    printResult({ root, converters: [status] }, options.json, options.quiet, renderConvertersStatus(status));
    return;
  }
  if (options.ingestAction === "status") {
    const result = await getIngestStatus(root, options.ingestPlanId);
    printResult(result, options.json, options.quiet, renderIngestResult("status", result));
    return;
  }
  if (options.ingestAction === "mark") {
    if (!options.ingestSource) throw new Error("ingest mark requires --source");
    if (!options.ingestStatus) throw new Error("ingest mark requires --status");
    const result = await markIngestSource(root, {
      planId: options.ingestPlanId,
      rawPath: options.ingestSource,
      status: options.ingestStatus,
      reason: options.ingestReason
    });
    printResult(result, options.json, options.quiet, renderIngestResult("marked", result));
    return;
  }
  if (options.ingestAction === "validate") {
    const result = await validateIngestPlan(root, options.ingestPlanId);
    printResult(result, options.json, options.quiet, renderIngestResult("validated", result));
    return;
  }
  if (options.ingestAction === "import-extractors") {
    if (!options.ingestFile) throw new Error("ingest import-extractors requires --file");
    const result = await importExtractorReport(root, options.ingestPlanId, path.resolve(options.ingestFile));
    printResult(result, options.json, options.quiet, renderIngestResult("imported extractor metadata", result));
    return;
  }
  throw new Error("ingest requires one of: plan, status, mark, validate, import-extractors, converters status");
}

function renderIngestResult(verb: string, result: IngestCommandResult): string {
  const counts = result.plan.summaryCounts;
  const conversionCounts = countConversions(result);
  return [
    `◆ Ingest ${verb}: ${result.plan.planId}`,
    `● Status: ${result.plan.planStatus}`,
    `● Sources: ${counts.discovered} discovered, ${counts.planned} planned, ${counts.summarized} summarized, ${counts.merged} merged, ${counts.skipped} skipped, ${counts.deferred} deferred, ${counts.changed} changed.`,
    `● Conversion: ${renderConversionCounts(conversionCounts)}`,
    `● Missing summaries: ${counts.missingSummaries}`,
    `● Validation failures: ${counts.validationFailures}`,
    `✓ Sidecar: ${result.planPath}`,
    `✓ Report: ${result.markdownPath}`,
    ""
  ].join("\n");
}

function renderConvertersStatus(status: Awaited<ReturnType<typeof markerProviderStatus>>): string {
  return [
    "◆ Ingest converters",
    `● marker: ${status.available ? `available (${status.command})` : "missing"}`,
    status.available ? "" : `→ ${status.setupHint}`,
    ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function countConversions(result: IngestCommandResult): Partial<Record<ConversionStatus, number>> {
  const counts: Partial<Record<ConversionStatus, number>> = {};
  for (const source of result.plan.sources) {
    counts[source.conversionStatus] = (counts[source.conversionStatus] ?? 0) + 1;
  }
  return counts;
}

function renderConversionCounts(counts: Partial<Record<ConversionStatus, number>>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "none";
  return entries.map(([status, count]) => `${count} ${status}`).join(", ");
}

function writeGreyToolLog(chunk: string): void {
  if (!chunk) return;
  process.stderr.write(`\x1b[90m${chunk}\x1b[0m`);
}

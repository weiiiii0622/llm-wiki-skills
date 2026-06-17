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

export async function ingestCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  if (options.ingestAction === "plan") {
    const result = await createIngestPlan(root, options.ingestRawRoots);
    printResult(result, options.json, options.quiet, renderIngestResult("planned", result));
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
  throw new Error("ingest requires one of: plan, status, mark, validate, import-extractors");
}

function renderIngestResult(verb: string, result: IngestCommandResult): string {
  const counts = result.plan.summaryCounts;
  return [
    `◆ Ingest ${verb}: ${result.plan.planId}`,
    `● Status: ${result.plan.planStatus}`,
    `● Sources: ${counts.discovered} discovered, ${counts.planned} planned, ${counts.summarized} summarized, ${counts.merged} merged, ${counts.skipped} skipped, ${counts.deferred} deferred, ${counts.changed} changed.`,
    `● Missing summaries: ${counts.missingSummaries}`,
    `● Validation failures: ${counts.validationFailures}`,
    `✓ Sidecar: ${result.planPath}`,
    `✓ Report: ${result.markdownPath}`,
    ""
  ].join("\n");
}

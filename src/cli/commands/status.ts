import path from "node:path";
import { buildStatusReport } from "../../core/manifest.js";
import { renderStatusReport } from "../../core/reports.js";
import type { CommandOptions } from "../../core/types.js";
import { printResult } from "../format.js";

export async function statusCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  const report = await buildStatusReport(root);
  printResult(report, options.json, options.quiet, renderStatusReport(report));
}

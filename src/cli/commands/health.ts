import path from "node:path";
import { assertVault } from "../../core/vault-contract.js";
import { buildHealthReport, renderHealthReport } from "../../core/reports.js";
import { findOrphanPages, validateVault } from "../../core/validators.js";
import type { CommandOptions } from "../../core/types.js";
import { printResult } from "../format.js";

export async function healthCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  await assertVault(root);
  const { pages, issues } = await validateVault(root);
  const report = buildHealthReport(root, pages, issues);
  report.orphanPages = findOrphanPages(pages);
  printResult(report, options.json, options.quiet, renderHealthReport(report));
}

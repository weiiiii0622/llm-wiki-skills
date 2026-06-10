import path from "node:path";
import { assertVault } from "../../core/vault-contract.js";
import { BrokenLinkError, InvalidFrontmatterError } from "../../core/errors.js";
import { renderLintReport } from "../../core/reports.js";
import { validateVault } from "../../core/validators.js";
import type { CommandOptions } from "../../core/types.js";
import { printResult } from "../format.js";

export async function lintCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  await assertVault(root);
  const { issues } = await validateVault(root);
  printResult({ status: issues.some((issue) => issue.severity === "error") ? "fail" : "pass", issues }, options.json, options.quiet, renderLintReport(issues));
  const firstError = issues.find((issue) => issue.severity === "error");
  if (!firstError) return;
  if (firstError.code === "BrokenLinkError") throw new BrokenLinkError(firstError.message);
  if (firstError.code === "InvalidFrontmatterError") throw new InvalidFrontmatterError(firstError.message);
}

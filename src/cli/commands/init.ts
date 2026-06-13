import type { CommandOptions } from "../../core/types.js";
import { renderInitReport } from "../../core/reports.js";
import { HostRequiredError } from "../../core/errors.js";
import { printResult } from "../format.js";
import { buildInitPlan, executeInitPlan, type InitPlan } from "../init-plan.js";

export async function initCommand(options: CommandOptions): Promise<void> {
  const plan = await resolveInitPlan(options);
  const results = await executeInitPlan(plan);

  printResult({ root: plan.root, hosts: plan.hosts, files: results }, options.json, options.quiet, renderInitReport(results));
}

async function resolveInitPlan(options: CommandOptions): Promise<InitPlan> {
  if (options.hosts.length > 0) return buildInitPlan(options.root, options.hosts);
  if (options.json || options.quiet) throw new HostRequiredError();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (!process.env.LLM_WIKI_SKILLS_TEST_PROMPTS) throw new HostRequiredError();
  }
  const { runInitWizard } = await import("../init-wizard.js");
  return runInitWizard(options.root);
}

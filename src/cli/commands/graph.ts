import path from "node:path";
import { readText, pathExists } from "../../core/fs.js";
import { assertVault } from "../../core/vault-contract.js";
import { buildGraph, graphJson, loadWikiPages, renderGraphMarkdown, writeGraphFiles } from "../../core/graph.js";
import { GraphDriftError } from "../../core/errors.js";
import type { CommandOptions } from "../../core/types.js";
import { renderGraphSummary } from "../../core/reports.js";
import { printResult } from "../format.js";
import { sameGraphJson, sameGraphMarkdown } from "../../core/validators.js";

export async function graphCommand(options: CommandOptions, check: boolean): Promise<void> {
  const root = path.resolve(options.root);
  await assertVault(root);
  if (check) {
    const graph = buildGraph(await loadWikiPages(root));
    const currentJson = (await pathExists(path.join(root, "wiki/graph.json"))) ? await readText(path.join(root, "wiki/graph.json")) : "";
    const currentMd = (await pathExists(path.join(root, "wiki/graph.md"))) ? await readText(path.join(root, "wiki/graph.md")) : "";
    if (!sameGraphJson(currentJson, graphJson(graph)) || !sameGraphMarkdown(currentMd, renderGraphMarkdown(graph))) {
      throw new GraphDriftError();
    }
    printResult({ status: "pass" }, options.json, options.quiet, "Graph check passed.\n");
    return;
  }
  const graph = await writeGraphFiles(root);
  printResult(graph, options.json, options.quiet, renderGraphSummary(graph));
}

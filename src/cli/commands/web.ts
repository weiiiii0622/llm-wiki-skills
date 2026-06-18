import path from "node:path";
import { assertVault } from "../../core/vault-contract.js";
import type { CommandOptions } from "../../core/types.js";
import { printResult } from "../format.js";
import { exportAtlas } from "../../core/web-export.js";
import { startAtlasServer } from "../../core/web-server.js";

export async function webCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  await assertVault(root);
  const outDir = path.resolve(options.webOut ?? path.join(root, ".llm-wiki-skills", "atlas"));
  if (options.webAction === "build") {
    const result = await exportAtlas(root, outDir);
    printResult(result, options.json, options.quiet, renderBuildSummary(result));
    return;
  }
  if (options.webAction === "serve") {
    const server = await startAtlasServer(root, outDir, options.webPort);
    printResult(
      {
        root: server.root,
        outDir: server.outDir,
        url: server.url,
        port: server.port
      },
      options.json,
      options.quiet,
      `Graph atlas serving at ${server.url}\n`
    );
    await new Promise<void>(() => undefined);
    return;
  }
  throw new Error("web requires one of: build, serve");
}

function renderBuildSummary(result: Awaited<ReturnType<typeof exportAtlas>>): string {
  return [
    "Graph atlas exported.",
    `  Out: ${result.outDir}`,
    `  Nodes: ${result.nodeCount}`,
    `  Edges: ${result.edgeCount}`,
    `  Pages: ${result.pageCount}`,
    `  Warnings: ${result.warningCount}`,
    ""
  ].join("\n");
}

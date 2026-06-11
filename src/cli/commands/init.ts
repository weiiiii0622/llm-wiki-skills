import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { CommandOptions, HostId } from "../../core/types.js";
import { createSharedReferenceFiles, createStarterFiles, createVaultDirectories } from "../../core/vault-contract.js";
import { renderInitReport } from "../../core/reports.js";
import { writeTextIfAbsent } from "../../core/fs.js";
import { getHostAdapters } from "../../core/hosts.js";
import { writeManifest } from "../../core/manifest.js";
import { HostRequiredError } from "../../core/errors.js";
import { printResult } from "../format.js";
import { selectHosts } from "../selector.js";

export async function initCommand(options: CommandOptions): Promise<void> {
  const root = path.resolve(options.root);
  const hosts = await resolveHosts(options.hosts);
  await mkdir(root, { recursive: true });

  const results: Record<string, "created" | "skipped"> = {};
  await createVaultDirectories(root);
  Object.assign(results, await createStarterFiles(root));
  Object.assign(results, await createHostFiles(root, hosts));
  Object.assign(results, await createSharedReferenceFiles(root));
  await writeManifest(root, hosts);
  results[".llm-wiki-skills.json"] = "created";

  printResult({ root, hosts, files: results }, options.json, options.quiet, renderInitReport(results));
}

async function resolveHosts(hosts: HostId[]): Promise<HostId[]> {
  if (hosts.length > 0) return hosts;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new HostRequiredError();
  return selectHosts(process.stdin, process.stdout);
}

async function createHostFiles(root: string, hosts: HostId[]): Promise<Record<string, "created" | "skipped">> {
  const results: Record<string, "created" | "skipped"> = {};
  for (const adapter of getHostAdapters(hosts)) {
    for (const skill of adapter.skills) {
      const relativePath = `${adapter.skillRoot}/${skill.name}/SKILL.md`;
      results[relativePath] = await writeTextIfAbsent(root, relativePath, skill.content);
    }
  }
  return results;
}

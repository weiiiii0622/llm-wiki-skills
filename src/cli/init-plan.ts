import { mkdir } from "node:fs/promises";
import path from "node:path";
import { atomicWriteText, stableJson, writeTextIfAbsent } from "../core/fs.js";
import { getHostAdapters } from "../core/hosts.js";
import { buildManifest, MANIFEST_PATH } from "../core/manifest.js";
import type { HostId } from "../core/types.js";
import { REQUIRED_DIRECTORIES, sharedReferenceFileEntries, starterFileEntries } from "../core/vault-contract.js";

export type InitFileGroupId = "starter" | "host" | "shared" | "manifest";

export interface PlannedInitFile {
  relativePath: string;
  content: string;
  group: InitFileGroupId;
  allowRaw?: boolean;
  overwrite?: boolean;
}

export interface InitPlan {
  root: string;
  hosts: HostId[];
  directories: string[];
  files: PlannedInitFile[];
}

export function buildInitPlan(root: string, hosts: HostId[]): InitPlan {
  const files: PlannedInitFile[] = [
    ...starterFileEntries().map((entry) => ({ ...entry, group: "starter" as const })),
    ...hostFileEntries(hosts),
    ...sharedReferenceFileEntries().map((entry) => ({ ...entry, group: "shared" as const })),
    {
      relativePath: MANIFEST_PATH,
      content: stableJson(buildManifest(hosts)),
      group: "manifest",
      overwrite: true
    }
  ];

  return {
    root: path.resolve(root),
    hosts: [...hosts],
    directories: [...REQUIRED_DIRECTORIES],
    files
  };
}

export async function executeInitPlan(plan: InitPlan): Promise<Record<string, "created" | "skipped">> {
  await mkdir(plan.root, { recursive: true });
  for (const directory of plan.directories) {
    await mkdir(path.join(plan.root, directory), { recursive: true });
  }

  const results: Record<string, "created" | "skipped"> = {};
  for (const file of plan.files) {
    if (file.overwrite) {
      await atomicWriteText(plan.root, file.relativePath, file.content, file.allowRaw);
      results[file.relativePath] = "created";
    } else {
      results[file.relativePath] = await writeTextIfAbsent(plan.root, file.relativePath, file.content, file.allowRaw);
    }
  }
  return results;
}

export function groupInitPlanFiles(plan: InitPlan): Record<InitFileGroupId, PlannedInitFile[]> {
  return {
    starter: plan.files.filter((file) => file.group === "starter"),
    host: plan.files.filter((file) => file.group === "host"),
    shared: plan.files.filter((file) => file.group === "shared"),
    manifest: plan.files.filter((file) => file.group === "manifest")
  };
}

function hostFileEntries(hosts: HostId[]): PlannedInitFile[] {
  const files: PlannedInitFile[] = [];
  for (const adapter of getHostAdapters(hosts)) {
    for (const skill of adapter.skills) {
      files.push({
        relativePath: `${adapter.skillRoot}/${skill.name}/SKILL.md`,
        content: skill.content,
        group: "host"
      });
    }
  }
  return files;
}

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { atomicWriteText, stableJson, writeTextIfAbsent } from "../core/fs.js";
import { getHostAdapters } from "../core/hosts.js";
import { buildManifest, MANIFEST_PATH } from "../core/manifest.js";
import { topicTemplateDirectories, topicTemplateFileEntries, type ResolvedTopicSelection } from "../core/topic-templates.js";
import type { HostId, ManifestTopicMetadata } from "../core/types.js";
import { REQUIRED_DIRECTORIES, sharedReferenceFileEntries, starterFileEntries } from "../core/vault-contract.js";

export type InitFileGroupId = "starter" | "topic" | "host" | "shared" | "manifest";

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
  topic: ResolvedTopicSelection;
  directories: string[];
  topicDirectories: string[];
  files: PlannedInitFile[];
}

export function buildInitPlan(root: string, hosts: HostId[], topic: ResolvedTopicSelection = defaultTopicSelection()): InitPlan {
  const files: PlannedInitFile[] = [
    ...starterFileEntries().map((entry) => ({ ...entry, group: "starter" as const })),
    ...topicTemplateFileEntries(topic).map((entry) => ({ ...entry, group: "topic" as const })),
    ...hostFileEntries(hosts),
    ...sharedReferenceFileEntries().map((entry) => ({ ...entry, group: "shared" as const })),
    {
      relativePath: MANIFEST_PATH,
      content: stableJson(buildManifest(hosts, topicManifestMetadata(topic))),
      group: "manifest",
      overwrite: true
    }
  ];

  return {
    root: path.resolve(root),
    hosts: [...hosts],
    topic,
    directories: [...REQUIRED_DIRECTORIES],
    topicDirectories: uniqueSorted(topicTemplateDirectories(topic)),
    files
  };
}

export async function executeInitPlan(plan: InitPlan): Promise<Record<string, "created" | "skipped">> {
  await mkdir(plan.root, { recursive: true });
  for (const directory of plan.directories) {
    await mkdir(path.join(plan.root, directory), { recursive: true });
  }

  const results: Record<string, "created" | "skipped"> = {};
  for (const directory of plan.topicDirectories) {
    const target = path.join(plan.root, directory);
    const existed = await directoryExists(target);
    await mkdir(target, { recursive: true });
    results[`${directory}/`] = existed ? "skipped" : "created";
  }
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

async function directoryExists(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function groupInitPlanFiles(plan: InitPlan): Record<InitFileGroupId, PlannedInitFile[]> {
  return {
    starter: plan.files.filter((file) => file.group === "starter"),
    topic: plan.files.filter((file) => file.group === "topic"),
    host: plan.files.filter((file) => file.group === "host"),
    shared: plan.files.filter((file) => file.group === "shared"),
    manifest: plan.files.filter((file) => file.group === "manifest")
  };
}

export function defaultTopicSelection(): ResolvedTopicSelection {
  return {
    id: "general",
    scaffoldId: "general",
    label: "General wiki"
  };
}

function topicManifestMetadata(topic: ResolvedTopicSelection): ManifestTopicMetadata {
  return {
    id: topic.id,
    scaffoldId: topic.scaffoldId,
    ...(topic.customTopic ? { customTopic: topic.customTopic } : {})
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

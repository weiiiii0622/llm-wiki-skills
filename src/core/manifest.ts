import path from "node:path";
import { readFile } from "node:fs/promises";
import { ManifestMismatchError, RequiredFileMissingError } from "./errors.js";
import { atomicWriteText, pathExists, stableJson } from "./fs.js";
import { getHostAdapters } from "./hosts.js";
import { isTopicSelectionId, isTopicTemplateId } from "./topic-templates.js";
import { REQUIRED_DIRECTORIES, sharedReferenceFilePaths, starterFilePaths } from "./vault-contract.js";
import type { HostId, Manifest, ManifestTopicMetadata, StatusReport } from "./types.js";

export const MANIFEST_PATH = ".llm-wiki-skills.json";

export function requiredFileRegistry(hosts: HostId[]): string[] {
  const files = new Set<string>([...starterFilePaths(), ...sharedReferenceFilePaths()]);
  for (const adapter of getHostAdapters(hosts)) {
    for (const skill of adapter.skills) {
      files.add(`${adapter.skillRoot}/${skill.name}/SKILL.md`);
    }
  }
  return [...files].sort();
}

export function buildManifest(hosts: HostId[], topic?: ManifestTopicMetadata): Manifest {
  const manifest: Manifest = {
    manifestVersion: 1,
    createdBy: "llm-wiki-skills",
    hosts: [...hosts].sort(),
    directories: [...REQUIRED_DIRECTORIES].sort(),
    files: requiredFileRegistry(hosts)
  };
  if (topic) manifest.topic = topic;
  return manifest;
}

export async function writeManifest(root: string, hosts: HostId[]): Promise<void> {
  await atomicWriteText(root, MANIFEST_PATH, stableJson(buildManifest(hosts)));
}

export async function loadManifest(root: string): Promise<Manifest> {
  const target = path.join(root, MANIFEST_PATH);
  if (!(await pathExists(target))) {
    throw new RequiredFileMissingError(`Missing manifest: ${MANIFEST_PATH}. Run \`llm-wiki-skills init --host <host>\`.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ManifestMismatchError(`Invalid manifest JSON in ${MANIFEST_PATH}: ${message}`);
  }
  return validateManifest(parsed);
}

export async function buildStatusReport(root: string): Promise<StatusReport> {
  const manifest = await loadManifest(root);
  const expectedFiles = requiredFileRegistry(manifest.hosts);
  const manifestFiles = [...manifest.files].sort();
  const missingManifestFiles = expectedFiles.filter((file) => !manifestFiles.includes(file));
  const extraManifestFiles = manifestFiles.filter((file) => !expectedFiles.includes(file));
  if (missingManifestFiles.length > 0 || extraManifestFiles.length > 0) {
    throw new ManifestMismatchError(
      `Manifest file registry does not match selected hosts. Missing from manifest: ${missingManifestFiles.join(", ") || "none"}. Extra in manifest: ${extraManifestFiles.join(", ") || "none"}.`
    );
  }

  const missingFiles: string[] = [];
  for (const file of manifestFiles) {
    if (!(await pathExists(path.join(root, file)))) missingFiles.push(file);
  }
  if (missingFiles.length > 0) {
    throw new RequiredFileMissingError(`Required file missing: ${missingFiles.join(", ")}`);
  }

  return {
    status: "pass",
    root,
    manifestPath: MANIFEST_PATH,
    hosts: manifest.hosts,
    topic: manifest.topic,
    checkedFiles: manifestFiles,
    missingFiles,
    extraManifestFiles,
    missingManifestFiles
  };
}

function validateManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object") {
    throw new ManifestMismatchError(`${MANIFEST_PATH} must be a JSON object.`);
  }
  const record = value as Record<string, unknown>;
  if (record.manifestVersion !== 1 || record.createdBy !== "llm-wiki-skills") {
    throw new ManifestMismatchError(`${MANIFEST_PATH} has an unsupported manifest header.`);
  }
  if (!Array.isArray(record.hosts) || !Array.isArray(record.directories) || !Array.isArray(record.files)) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} is missing hosts, directories, or files arrays.`);
  }
  const hosts = record.hosts;
  if (!hosts.every((host): host is HostId => host === "codex" || host === "claude-code")) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an unsupported host.`);
  }
  const directories = record.directories;
  const files = record.files;
  if (!directories.every((directory): directory is string => typeof directory === "string")) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an invalid directory path.`);
  }
  if (!files.every((file): file is string => typeof file === "string")) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an invalid file path.`);
  }
  const topic = validateManifestTopic(record.topic);
  return {
    manifestVersion: 1,
    createdBy: "llm-wiki-skills",
    hosts: [...new Set(hosts)].sort(),
    directories: [...directories].sort(),
    files: [...files].sort(),
    ...(topic ? { topic } : {})
  };
}

function validateManifestTopic(value: unknown): ManifestTopicMetadata | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an invalid topic metadata object.`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !isTopicSelectionId(record.id)) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an unsupported topic id.`);
  }
  if (typeof record.scaffoldId !== "string" || !isTopicTemplateId(record.scaffoldId)) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an unsupported topic scaffold id.`);
  }
  if (record.id !== "custom" && record.scaffoldId !== record.id) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains inconsistent topic metadata.`);
  }
  if (record.id === "custom" && record.scaffoldId !== "general") {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains inconsistent custom topic metadata.`);
  }
  if (record.customTopic !== undefined && typeof record.customTopic !== "string") {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains invalid custom topic text.`);
  }
  return {
    id: record.id,
    scaffoldId: record.scaffoldId,
    ...(typeof record.customTopic === "string" ? { customTopic: record.customTopic } : {})
  };
}

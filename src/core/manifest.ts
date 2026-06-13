import path from "node:path";
import { readFile } from "node:fs/promises";
import { ManifestMismatchError, RequiredFileMissingError } from "./errors.js";
import { atomicWriteText, pathExists, stableJson } from "./fs.js";
import { getHostAdapters } from "./hosts.js";
import { obsidianGeneratedFilePaths, obsidianIntegrationMetadata } from "./obsidian.js";
import { isTopicSelectionId, isTopicTemplateId } from "./topic-templates.js";
import { REQUIRED_DIRECTORIES, sharedReferenceFilePaths, starterFilePaths } from "./vault-contract.js";
import type { HostId, Manifest, ManifestIntegrations, ManifestTopicMetadata, StatusReport } from "./types.js";

export const MANIFEST_PATH = ".llm-wiki-skills.json";

export function requiredFileRegistry(hosts: HostId[], integrations?: ManifestIntegrations): string[] {
  const files = new Set<string>([...starterFilePaths(), ...sharedReferenceFilePaths()]);
  for (const adapter of getHostAdapters(hosts)) {
    for (const skill of adapter.skills) {
      files.add(`${adapter.skillRoot}/${skill.name}/SKILL.md`);
    }
  }
  if (integrations?.obsidian?.enabled) {
    for (const file of obsidianGeneratedFilePaths()) files.add(file);
  }
  return [...files].sort();
}

export function buildManifest(hosts: HostId[], topic?: ManifestTopicMetadata, integrations?: ManifestIntegrations): Manifest {
  const manifest: Manifest = {
    manifestVersion: 1,
    createdBy: "llm-wiki-skills",
    hosts: [...hosts].sort(),
    directories: [...REQUIRED_DIRECTORIES].sort(),
    files: requiredFileRegistry(hosts, integrations)
  };
  if (topic) manifest.topic = topic;
  if (integrations) manifest.integrations = integrations;
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
  const expectedFiles = requiredFileRegistry(manifest.hosts, manifest.integrations);
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
    integrations: manifest.integrations,
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
  const integrations = validateManifestIntegrations(record.integrations);
  return {
    manifestVersion: 1,
    createdBy: "llm-wiki-skills",
    hosts: [...new Set(hosts)].sort(),
    directories: [...directories].sort(),
    files: [...files].sort(),
    ...(topic ? { topic } : {}),
    ...(integrations ? { integrations } : {})
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

function validateManifestIntegrations(value: unknown): ManifestIntegrations | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an invalid integrations object.`);
  }
  const record = value as Record<string, unknown>;
  if (record.obsidian === undefined) return undefined;
  if (!record.obsidian || typeof record.obsidian !== "object") {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains an invalid Obsidian integration object.`);
  }
  const obsidian = record.obsidian as Record<string, unknown>;
  if (obsidian.enabled !== true || obsidian.schemaVersion !== 1 || !Array.isArray(obsidian.generatedFiles)) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains unsupported Obsidian integration metadata.`);
  }
  const generatedFiles = obsidian.generatedFiles;
  if (!generatedFiles.every((file): file is string => typeof file === "string")) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains invalid Obsidian generated file paths.`);
  }
  const expected = obsidianIntegrationMetadata().generatedFiles;
  const normalized = [...new Set(generatedFiles)].sort();
  if (normalized.join("\0") !== expected.join("\0")) {
    throw new ManifestMismatchError(`${MANIFEST_PATH} contains unsupported Obsidian generated file paths.`);
  }
  return {
    obsidian: {
      enabled: true,
      schemaVersion: 1,
      generatedFiles: normalized
    }
  };
}

import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { lstat, mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import {
  IngestConversionFailedError,
  IngestConversionMissingOutputError,
  IngestConversionTimeoutError,
  IngestConversionUnsafeOutputError,
  IngestConversionUnsupportedFileError,
  IngestExtractorReportInvalidError,
  IngestInvalidTransitionError,
  IngestMarkerMissingError,
  IngestPlanAmbiguousError,
  IngestPlanInvalidError,
  IngestPlanMissingError,
  IngestRawDriftError,
  IngestRawPathInvalidError,
  IngestSummaryMissingError,
  IngestValidationFailedError
} from "../errors.js";
import { atomicWriteText, listMarkdownFiles, pathExists, readText, stableJson } from "../fs.js";
import { assertVault } from "../vault-contract.js";
import { normalizeRoot, toPosixPath } from "../path-guard.js";
import {
  conversionPathIsInsideConvertedDir,
  convertSourceWithMarker,
  defaultConversionOptions,
  isMarkerConvertibleExtension,
  markerProviderStatus,
  type ConversionFields,
  type ConversionOptions,
  type ConversionStatus
} from "./converters.js";

export const DEFAULT_RAW_ROOTS = ["raw/sources", "raw/notes"] as const;
export const INGEST_ARCHIVE_DIR = "raw/archieved";
export const INGEST_PLAN_DIR = ".llm-wiki-skills/ingest-plans";
export const INGEST_SCHEMA_VERSION = 2;
const INGEST_EXTRACTOR_REPORT_SCHEMA_VERSION = 1;
const LEGACY_INGEST_PLAN_DIR = "wiki/ingest-plans";

const BATCH_TARGET_TOKENS = 12000;
const BATCH_MAX_FILES = 12;
const FINAL_INCOMPLETE_STATUSES = new Set<IngestSourceStatus>(["planned", "summarized", "changed"]);

export type IngestPlanStatus = "active" | "validated" | "archived";
export type IngestSourceStatus = "planned" | "summarized" | "merged" | "skipped" | "deferred" | "changed";
export type IngestMarkStatus = "summarized" | "merged" | "skipped" | "deferred";
export type IngestContentKind = "markdown" | "text" | "unknown";
export type IngestComplexity = "low" | "medium" | "high";

export interface IngestExtractorMetadata {
  extractorName: string;
  importedAt: string;
  titleCandidates: string[];
  roughTopics: string[];
  complexity: IngestComplexity;
  estimatedTokens: number;
  batchHints?: string[];
}

export interface IngestSource extends ConversionFields {
  id: string;
  rawPath: string;
  sizeBytes: number;
  mtime: string;
  sha256: string;
  extension: string;
  contentKind: IngestContentKind;
  extractorMetadata?: IngestExtractorMetadata;
  status: IngestSourceStatus;
  expectedSummaryPath: string;
  archivedRawPath?: string;
  reason?: string;
  lastMarkedAt?: string;
}

export interface IngestBatch {
  id: string;
  sourceIds: string[];
  rawPaths: string[];
  estimatedTokens: number;
  targetTokenBudget: number;
}

export interface IngestSummaryCounts {
  discovered: number;
  planned: number;
  summarized: number;
  merged: number;
  skipped: number;
  deferred: number;
  changed: number;
  missingSummaries: number;
  validationFailures: number;
}

export interface IngestPlanSidecar {
  schemaVersion: 2;
  planId: string;
  planStatus: IngestPlanStatus;
  createdAt: string;
  updatedAt: string;
  rawRoots: string[];
  sources: IngestSource[];
  batches: IngestBatch[];
  summaryCounts: IngestSummaryCounts;
}

export interface IngestCommandResult {
  root: string;
  planPath: string;
  markdownPath: string;
  plan: IngestPlanSidecar;
  validationFailures?: string[];
}

export interface ExtractorReport {
  schemaVersion: 1;
  planId: string;
  createdAt: string;
  extractorName: string;
  sources: ExtractorReportSource[];
}

interface ExtractorReportSource {
  rawPath: string;
  contentKind: IngestContentKind;
  titleCandidates: string[];
  roughTopics: string[];
  complexity: IngestComplexity;
  estimatedTokens: number;
  batchHints?: string[];
}

interface RawInventoryEntry {
  rawPath: string;
  sizeBytes: number;
  mtime: string;
  sha256: string;
  extension: string;
  contentKind: IngestContentKind;
}

export async function createIngestPlan(rootInput: string, rawRootsInput: string[] = [], conversionInput: Partial<ConversionOptions> = {}): Promise<IngestCommandResult> {
  const root = normalizeRoot(rootInput);
  await assertVault(root);
  const now = currentIso();
  const rawRoots = normalizeRawRoots(root, rawRootsInput.length > 0 ? rawRootsInput : [...DEFAULT_RAW_ROOTS]);
  const inventory = await listRawEvidenceFiles(root, rawRoots);
  const summaryPaths = expectedSummaryPaths(inventory);
  const planId = await makePlanId(root, now);
  const conversionOptions = defaultConversionOptions(conversionInput);
  const markerStatus =
    conversionOptions.enabled && inventory.some((entry) => isMarkerConvertibleExtension(entry.extension)) ? await markerProviderStatus() : undefined;
  const sources: IngestSource[] = [];
  for (const [index, entry] of inventory.entries()) {
    const source = {
      id: `src-${String(index + 1).padStart(4, "0")}`,
      ...entry,
      status: "planned" as const,
      expectedSummaryPath: summaryPaths.get(entry.rawPath) ?? summaryPathForSlug(baseSourceSlug(entry.rawPath), entry.sha256)
    };
    sources.push({
      ...source,
      ...(await convertSourceWithMarker({ root, planId, source, options: conversionOptions, markerStatus }))
    });
  }
  const plan: IngestPlanSidecar = {
    schemaVersion: INGEST_SCHEMA_VERSION,
    planId,
    planStatus: "active",
    createdAt: now,
    updatedAt: now,
    rawRoots,
    sources,
    batches: planBatches(sources),
    summaryCounts: summarize(sources, root)
  };
  await archiveActivePlans(root);
  await writePlan(root, plan);
  await writeMarkdownPlan(root, plan);
  return result(root, plan);
}

export async function getIngestStatus(rootInput: string, planId?: string): Promise<IngestCommandResult> {
  const root = normalizeRoot(rootInput);
  await assertVault(root);
  const plan = await loadPlan(root, planId);
  const archived = await archiveMergedRawSources(root, plan);
  const drifted = await markDriftedSources(root, plan);
  plan.summaryCounts = summarize(plan.sources, root, plan.summaryCounts.validationFailures);
  if (archived || drifted) {
    plan.updatedAt = currentIso();
    await writePlan(root, plan);
    await writeMarkdownPlan(root, plan);
  }
  return result(root, plan);
}

export async function markIngestSource(rootInput: string, options: { planId?: string; rawPath: string; status: IngestMarkStatus; reason?: string }): Promise<IngestCommandResult> {
  const root = normalizeRoot(rootInput);
  await assertVault(root);
  const plan = await loadPlan(root, options.planId);
  const source = plan.sources.find((candidate) => candidate.rawPath === toPosixPath(options.rawPath));
  if (!source) throw new IngestInvalidTransitionError(`Unknown ingest source: ${options.rawPath}`);
  await failOnDrift(root, plan, source);
  const now = currentIso();
  const reason = options.reason?.trim();
  if ((options.status === "skipped" || options.status === "deferred") && !reason) {
    throw new IngestInvalidTransitionError(`${options.status} requires --reason.`);
  }
  if (options.status === "summarized" && !(await pathExists(path.join(root, source.expectedSummaryPath)))) {
    throw new IngestSummaryMissingError(`Expected source summary is missing: ${source.expectedSummaryPath}`);
  }
  if (options.status === "merged" && source.status !== "summarized") {
    throw new IngestInvalidTransitionError(`Cannot mark ${source.rawPath} merged from ${source.status}; mark summarized first.`);
  }
  if (!isLegalTransition(source.status, options.status)) {
    throw new IngestInvalidTransitionError(`Invalid ingest transition for ${source.rawPath}: ${source.status} -> ${options.status}`);
  }
  source.status = options.status;
  source.lastMarkedAt = now;
  if (reason) source.reason = reason;
  if (options.status === "summarized" || options.status === "merged") delete source.reason;
  if (options.status === "merged") {
    source.archivedRawPath = await archiveRawSource(root, source);
  }
  plan.updatedAt = now;
  plan.summaryCounts = summarize(plan.sources, root);
  await writePlan(root, plan);
  await writeMarkdownPlan(root, plan);
  return result(root, plan);
}

export async function importExtractorReport(rootInput: string, planId: string | undefined, filePath: string): Promise<IngestCommandResult> {
  const root = normalizeRoot(rootInput);
  await assertVault(root);
  const plan = await loadPlan(root, planId);
  const report = validateExtractorReport(await readExtractorJsonFile(filePath));
  if (report.planId !== plan.planId) {
    throw new IngestExtractorReportInvalidError(`Extractor report planId ${report.planId} does not match ${plan.planId}.`);
  }
  const byRawPath = new Map(plan.sources.map((source) => [source.rawPath, source]));
  const importedAt = currentIso();
  for (const reportSource of report.sources) {
    const source = byRawPath.get(reportSource.rawPath);
    if (!source) throw new IngestExtractorReportInvalidError(`Extractor report references unknown source: ${reportSource.rawPath}`);
    source.contentKind = reportSource.contentKind;
    source.extractorMetadata = {
      extractorName: report.extractorName,
      importedAt,
      titleCandidates: reportSource.titleCandidates,
      roughTopics: reportSource.roughTopics,
      complexity: reportSource.complexity,
      estimatedTokens: reportSource.estimatedTokens,
      ...(reportSource.batchHints ? { batchHints: reportSource.batchHints } : {})
    };
  }
  plan.batches = planBatches(plan.sources);
  plan.updatedAt = importedAt;
  plan.summaryCounts = summarize(plan.sources, root);
  await writePlan(root, plan);
  await writeMarkdownPlan(root, plan);
  return result(root, plan);
}

export async function validateIngestPlan(rootInput: string, planId?: string): Promise<IngestCommandResult> {
  const root = normalizeRoot(rootInput);
  await assertVault(root);
  const plan = await loadPlan(root, planId);
  await archiveMergedRawSources(root, plan);
  const failures: string[] = [];
  let missingSummary = false;
  let drifted = false;
  for (const source of plan.sources) {
    if (source.status === "skipped" || source.status === "deferred") {
      if (!source.reason?.trim()) failures.push(`${source.rawPath} is ${source.status} without a reason.`);
      continue;
    }
    const fullRawPath = await sourceStoragePath(root, source);
    if (!fullRawPath) {
      failures.push(`${source.rawPath} is missing from raw evidence.`);
      continue;
    }
    const currentHash = await sha256File(fullRawPath);
    if (currentHash !== source.sha256) {
      source.status = "changed";
      drifted = true;
      failures.push(`${source.rawPath} hash changed since planning.`);
    }
    failures.push(...(await validateSourceConversion(root, plan, source)));
    if (FINAL_INCOMPLETE_STATUSES.has(source.status)) {
      failures.push(`${source.rawPath} is still ${source.status}.`);
    }
    if ((source.status === "summarized" || source.status === "merged") && !(await pathExists(path.join(root, source.expectedSummaryPath)))) {
      missingSummary = true;
      failures.push(`${source.rawPath} is missing expected summary ${source.expectedSummaryPath}.`);
      continue;
    }
    if (source.status === "summarized" || source.status === "merged") {
      const summary = await readText(path.join(root, source.expectedSummaryPath));
      if (!summary.includes(source.rawPath) || !summary.includes(source.sha256)) {
        failures.push(`${source.expectedSummaryPath} must reference raw path and sha256.`);
      }
    }
  }
  const citedSummaryPaths = await durableWikiCitations(root);
  for (const source of plan.sources.filter((candidate) => candidate.status === "merged")) {
    if (!citedSummaryPaths.has(source.expectedSummaryPath)) {
      failures.push(`${source.rawPath} is merged but no durable wiki page cites ${source.expectedSummaryPath}.`);
    }
  }
  plan.summaryCounts = summarize(plan.sources, root);
  plan.summaryCounts.validationFailures = failures.length;
  plan.updatedAt = currentIso();
  if (failures.length === 0) plan.planStatus = "validated";
  await writePlan(root, plan);
  await writeMarkdownPlan(root, plan);
  if (drifted) throw new IngestRawDriftError(failures.join("\n"));
  if (missingSummary) throw new IngestSummaryMissingError(failures.join("\n"));
  const conversionError = conversionValidationError(plan, failures);
  if (conversionError) throw conversionError;
  if (failures.length > 0) throw new IngestValidationFailedError(failures.join("\n"));
  return result(root, plan, failures);
}

export async function listRawEvidenceFiles(rootInput: string, rawRootsInput: string[]): Promise<RawInventoryEntry[]> {
  const root = normalizeRoot(rootInput);
  const rawRoots = normalizeRawRoots(root, rawRootsInput);
  const found: RawInventoryEntry[] = [];
  for (const rawRoot of rawRoots) {
    const absoluteRawRoot = path.join(root, rawRoot);
    const rootStat = await lstat(absoluteRawRoot).catch(() => undefined);
    if (!rootStat) continue;
    if (rootStat.isSymbolicLink()) throw new IngestRawPathInvalidError(`Refusing to scan symlinked raw root: ${rawRoot}`);
    if (!rootStat.isDirectory()) throw new IngestRawPathInvalidError(`Raw path must be a directory: ${rawRoot}`);
    await walkRaw(root, absoluteRawRoot, found);
  }
  return dedupeByRawPath(found).sort((a, b) => a.rawPath.localeCompare(b.rawPath));
}

function normalizeRawRoots(root: string, rawRoots: string[]): string[] {
  const normalized: string[] = [];
  for (const rawRoot of rawRoots) {
    const resolved = path.isAbsolute(rawRoot) ? rawRoot : path.resolve(root, rawRoot);
    const relative = toPosixPath(path.relative(root, path.resolve(resolved))).replace(/\/+$/, "");
    if (relative === "" || relative.startsWith("../") || relative.includes("/../") || relative === "..") {
      throw new IngestRawPathInvalidError(`Raw root is outside vault: ${rawRoot}`);
    }
    if (relative !== "raw" && !relative.startsWith("raw/")) {
      throw new IngestRawPathInvalidError(`Raw root must be inside raw/: ${rawRoot}`);
    }
    normalized.push(relative);
  }
  return [...new Set(normalized)].sort();
}

async function walkRaw(root: string, current: string, found: RawInventoryEntry[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const entryStat = await lstat(absolute);
    const relative = toPosixPath(path.relative(root, absolute));
    if (relative === INGEST_ARCHIVE_DIR || relative.startsWith(`${INGEST_ARCHIVE_DIR}/`)) continue;
    if (entryStat.isSymbolicLink()) {
      throw new IngestRawPathInvalidError(`Refusing to scan symlinked raw path: ${relative}`);
    }
    if (entryStat.isDirectory()) {
      await walkRaw(root, absolute, found);
    } else if (entryStat.isFile()) {
      found.push({
        rawPath: relative,
        sizeBytes: entryStat.size,
        mtime: entryStat.mtime.toISOString(),
        sha256: await sha256File(absolute),
        extension: path.extname(entry.name).toLowerCase(),
        contentKind: contentKind(entry.name)
      });
    }
  }
}

async function loadPlan(root: string, planId?: string): Promise<IngestPlanSidecar> {
  if (planId) return readPlan(root, planId);
  const active = await activePlans(root);
  if (active.length === 0) throw new IngestPlanMissingError();
  if (active.length > 1) throw new IngestPlanAmbiguousError(`Multiple active ingest plans found: ${active.map((plan) => plan.planId).join(", ")}. Pass --plan.`);
  return active[0]!;
}

async function activePlans(root: string): Promise<IngestPlanSidecar[]> {
  const dir = path.join(root, INGEST_PLAN_DIR);
  const entries = await readdir(dir).catch(() => []);
  const plans: IngestPlanSidecar[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json")).sort()) {
    const planId = entry.slice(0, -".json".length);
    const plan = await readPlan(root, planId);
    if (plan.planStatus === "active") plans.push(plan);
  }
  return plans;
}

async function archiveActivePlans(root: string): Promise<void> {
  const plans = await activePlans(root).catch(() => []);
  const now = currentIso();
  for (const plan of plans) {
    plan.planStatus = "archived";
    plan.updatedAt = now;
    await writePlan(root, plan);
    await writeMarkdownPlan(root, plan);
  }
}

async function readPlan(root: string, planId: string): Promise<IngestPlanSidecar> {
  const file = path.join(root, INGEST_PLAN_DIR, `${planId}.json`);
  const legacyFile = path.join(root, LEGACY_INGEST_PLAN_DIR, `${planId}.json`);
  const readableFile = (await pathExists(file)) ? file : (await pathExists(legacyFile)) ? legacyFile : undefined;
  if (!readableFile) throw new IngestPlanMissingError(`Ingest plan not found: ${planId}`);
  return validatePlanSidecar(await readJsonFile(readableFile), planId);
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readText(file));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IngestPlanInvalidError(`Invalid JSON in ${file}: ${message}`);
  }
}

async function readExtractorJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readText(file));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IngestExtractorReportInvalidError(`Invalid JSON in ${file}: ${message}`);
  }
}

function validatePlanSidecar(value: unknown, expectedPlanId?: string): IngestPlanSidecar {
  try {
    const object = requireObject(value, "ingest plan");
    const schemaVersion = object.schemaVersion;
    if (schemaVersion !== 1 && schemaVersion !== INGEST_SCHEMA_VERSION) throw new Error("Unsupported ingest plan schemaVersion.");
    const planId = requireString(object.planId, "planId");
    if (expectedPlanId && planId !== expectedPlanId) throw new Error(`Plan id mismatch: expected ${expectedPlanId}, found ${planId}.`);
    const planStatus = requireEnum(object.planStatus, ["active", "validated", "archived"], "planStatus");
    const sourcesValue = requireArray(object.sources, "sources");
    const sources = sourcesValue.map((source, index) => validateSource(source, index, schemaVersion));
    return {
      schemaVersion: INGEST_SCHEMA_VERSION,
      planId,
      planStatus,
      createdAt: requireString(object.createdAt, "createdAt"),
      updatedAt: requireString(object.updatedAt, "updatedAt"),
      rawRoots: requireArray(object.rawRoots, "rawRoots").map((entry, index) => requireString(entry, `rawRoots[${index}]`)),
      sources,
      batches: requireArray(object.batches, "batches").map(validateBatch),
      summaryCounts: validateSummaryCounts(object.summaryCounts)
    };
  } catch (error) {
    if (error instanceof IngestPlanInvalidError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new IngestPlanInvalidError(message);
  }
}

function validateSource(value: unknown, index: number, schemaVersion: unknown): IngestSource {
  const object = requireObject(value, `sources[${index}]`);
  const conversionStatus =
    schemaVersion === 1 ? "not-needed" : requireEnum(object.conversionStatus, conversionStatuses, `sources[${index}].conversionStatus`);
  return {
    id: requireString(object.id, `sources[${index}].id`),
    rawPath: requireString(object.rawPath, `sources[${index}].rawPath`),
    sizeBytes: requireNumber(object.sizeBytes, `sources[${index}].sizeBytes`),
    mtime: requireString(object.mtime, `sources[${index}].mtime`),
    sha256: requireString(object.sha256, `sources[${index}].sha256`),
    extension: requireString(object.extension, `sources[${index}].extension`),
    contentKind: requireEnum(object.contentKind, ["markdown", "text", "unknown"], `sources[${index}].contentKind`),
    status: requireEnum(object.status, ["planned", "summarized", "merged", "skipped", "deferred", "changed"], `sources[${index}].status`),
    expectedSummaryPath: requireString(object.expectedSummaryPath, `sources[${index}].expectedSummaryPath`),
    ...(object.archivedRawPath === undefined ? {} : { archivedRawPath: validateArchivedRawPath(object.archivedRawPath, `sources[${index}].archivedRawPath`) }),
    conversionStatus,
    ...(object.convertedMarkdownPath === undefined
      ? {}
      : { convertedMarkdownPath: requireString(object.convertedMarkdownPath, `sources[${index}].convertedMarkdownPath`) }),
    ...(object.convertedAssetPaths === undefined
      ? {}
      : {
          convertedAssetPaths: requireArray(object.convertedAssetPaths, `sources[${index}].convertedAssetPaths`).map((entry, entryIndex) =>
            requireString(entry, `sources[${index}].convertedAssetPaths[${entryIndex}]`)
          )
        }),
    ...(object.converterName === undefined ? {} : { converterName: requireEnum(object.converterName, ["marker"], `sources[${index}].converterName`) }),
    ...(object.converterCommand === undefined ? {} : { converterCommand: requireString(object.converterCommand, `sources[${index}].converterCommand`) }),
    ...(object.conversionError === undefined ? {} : { conversionError: requireString(object.conversionError, `sources[${index}].conversionError`) }),
    ...(object.extractorMetadata === undefined ? {} : { extractorMetadata: validateExtractorMetadata(object.extractorMetadata, `sources[${index}].extractorMetadata`) }),
    ...(object.reason === undefined ? {} : { reason: requireString(object.reason, `sources[${index}].reason`) }),
    ...(object.lastMarkedAt === undefined ? {} : { lastMarkedAt: requireString(object.lastMarkedAt, `sources[${index}].lastMarkedAt`) })
  };
}

function validateExtractorMetadata(value: unknown, label: string): IngestExtractorMetadata {
  const object = requireObject(value, label);
  return {
    extractorName: requireString(object.extractorName, `${label}.extractorName`),
    importedAt: requireString(object.importedAt, `${label}.importedAt`),
    titleCandidates: requireArray(object.titleCandidates, `${label}.titleCandidates`).map((entry, index) => requireString(entry, `${label}.titleCandidates[${index}]`)),
    roughTopics: requireArray(object.roughTopics, `${label}.roughTopics`).map((entry, index) => requireString(entry, `${label}.roughTopics[${index}]`)),
    complexity: requireEnum(object.complexity, ["low", "medium", "high"], `${label}.complexity`),
    estimatedTokens: requireNumber(object.estimatedTokens, `${label}.estimatedTokens`),
    ...(object.batchHints === undefined
      ? {}
      : { batchHints: requireArray(object.batchHints, `${label}.batchHints`).map((entry, index) => requireString(entry, `${label}.batchHints[${index}]`)) })
  };
}

function validateBatch(value: unknown, index: number): IngestBatch {
  const object = requireObject(value, `batches[${index}]`);
  return {
    id: requireString(object.id, `batches[${index}].id`),
    sourceIds: requireArray(object.sourceIds, `batches[${index}].sourceIds`).map((entry, entryIndex) => requireString(entry, `batches[${index}].sourceIds[${entryIndex}]`)),
    rawPaths: requireArray(object.rawPaths, `batches[${index}].rawPaths`).map((entry, entryIndex) => requireString(entry, `batches[${index}].rawPaths[${entryIndex}]`)),
    estimatedTokens: requireNumber(object.estimatedTokens, `batches[${index}].estimatedTokens`),
    targetTokenBudget: requireNumber(object.targetTokenBudget, `batches[${index}].targetTokenBudget`)
  };
}

function validateSummaryCounts(value: unknown): IngestSummaryCounts {
  const object = requireObject(value, "summaryCounts");
  return {
    discovered: requireNumber(object.discovered, "summaryCounts.discovered"),
    planned: requireNumber(object.planned, "summaryCounts.planned"),
    summarized: requireNumber(object.summarized, "summaryCounts.summarized"),
    merged: requireNumber(object.merged, "summaryCounts.merged"),
    skipped: requireNumber(object.skipped, "summaryCounts.skipped"),
    deferred: requireNumber(object.deferred, "summaryCounts.deferred"),
    changed: requireNumber(object.changed, "summaryCounts.changed"),
    missingSummaries: requireNumber(object.missingSummaries, "summaryCounts.missingSummaries"),
    validationFailures: requireNumber(object.validationFailures, "summaryCounts.validationFailures")
  };
}

function validateExtractorReport(value: unknown): ExtractorReport {
  try {
    const object = requireObject(value, "extractor report");
    if (object.schemaVersion !== INGEST_EXTRACTOR_REPORT_SCHEMA_VERSION) throw new Error("Unsupported extractor report schemaVersion.");
    return {
      schemaVersion: INGEST_EXTRACTOR_REPORT_SCHEMA_VERSION,
      planId: requireString(object.planId, "planId"),
      createdAt: requireString(object.createdAt, "createdAt"),
      extractorName: requireString(object.extractorName, "extractorName"),
      sources: requireArray(object.sources, "sources").map((source, index) => {
        const sourceObject = requireObject(source, `sources[${index}]`);
        return {
          rawPath: requireString(sourceObject.rawPath, `sources[${index}].rawPath`),
          contentKind: requireEnum(sourceObject.contentKind, ["markdown", "text", "unknown"], `sources[${index}].contentKind`),
          titleCandidates: requireArray(sourceObject.titleCandidates, `sources[${index}].titleCandidates`).map((entry, entryIndex) =>
            requireString(entry, `sources[${index}].titleCandidates[${entryIndex}]`)
          ),
          roughTopics: requireArray(sourceObject.roughTopics, `sources[${index}].roughTopics`).map((entry, entryIndex) =>
            requireString(entry, `sources[${index}].roughTopics[${entryIndex}]`)
          ),
          complexity: requireEnum(sourceObject.complexity, ["low", "medium", "high"], `sources[${index}].complexity`),
          estimatedTokens: requireNumber(sourceObject.estimatedTokens, `sources[${index}].estimatedTokens`),
          ...(sourceObject.batchHints === undefined
            ? {}
            : {
                batchHints: requireArray(sourceObject.batchHints, `sources[${index}].batchHints`).map((entry, entryIndex) =>
                  requireString(entry, `sources[${index}].batchHints[${entryIndex}]`)
                )
              })
        };
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IngestExtractorReportInvalidError(message);
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requireEnum<const T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}

function validateArchivedRawPath(value: unknown, label: string): string {
  const archivedRawPath = requireString(value, label);
  if (path.isAbsolute(archivedRawPath) || archivedRawPath.includes("..") || archivedRawPath === INGEST_ARCHIVE_DIR) {
    throw new Error(`${label} must be inside ${INGEST_ARCHIVE_DIR}/.`);
  }
  if (!archivedRawPath.startsWith(`${INGEST_ARCHIVE_DIR}/`)) {
    throw new Error(`${label} must be inside ${INGEST_ARCHIVE_DIR}/.`);
  }
  return archivedRawPath;
}

const conversionStatuses = [
  "not-needed",
  "converted",
  "asset-only",
  "missing-tool",
  "disabled",
  "timeout",
  "failed",
  "missing-output",
  "unsupported",
  "unsafe-output",
  "oversized"
] as const satisfies readonly ConversionStatus[];

async function validateSourceConversion(root: string, plan: IngestPlanSidecar, source: IngestSource): Promise<string[]> {
  const failures: string[] = [];
  const checkPath = async (field: string, relativePath: string, requireMarkdownBody: boolean): Promise<void> => {
    if (!conversionPathIsInsideConvertedDir(root, plan.planId, relativePath)) {
      failures.push(`${source.rawPath} has unsafe ${field}: ${relativePath}`);
      return;
    }
    const absolute = path.join(root, relativePath);
    if (!(await pathExists(absolute))) {
      failures.push(`${source.rawPath} is missing converted output ${relativePath}.`);
      return;
    }
    if (requireMarkdownBody && (await readText(absolute)).trim().length === 0) {
      failures.push(`${source.rawPath} has empty converted markdown ${relativePath}.`);
    }
  };

  if (source.convertedMarkdownPath) {
    await checkPath("convertedMarkdownPath", source.convertedMarkdownPath, source.conversionStatus !== "asset-only");
  }
  for (const assetPath of source.convertedAssetPaths ?? []) {
    await checkPath("convertedAssetPaths", assetPath, false);
  }

  if (source.conversionStatus === "converted" && !source.convertedMarkdownPath) {
    failures.push(`${source.rawPath} is marked converted without convertedMarkdownPath.`);
  }
  if (source.conversionStatus === "asset-only" && (source.convertedAssetPaths ?? []).length === 0) {
    failures.push(`${source.rawPath} is marked asset-only without converted assets.`);
  }

  const unhandledConversionStatuses = new Set<ConversionStatus>([
    "missing-tool",
    "disabled",
    "timeout",
    "failed",
    "missing-output",
    "unsupported",
    "unsafe-output",
    "oversized"
  ]);
  if (source.status === "planned" && unhandledConversionStatuses.has(source.conversionStatus)) {
    failures.push(`${source.rawPath} conversion is ${source.conversionStatus}: ${source.conversionError ?? "conversion did not produce readable markdown."}`);
  }
  return failures;
}

function conversionValidationError(plan: IngestPlanSidecar, failures: string[]): Error | undefined {
  if (failures.length === 0) return undefined;
  const message = failures.join("\n");
  if (failures.some((failure) => failure.includes("unsafe convertedMarkdownPath") || failure.includes("unsafe convertedAssetPaths"))) {
    return new IngestConversionUnsafeOutputError(message);
  }
  const unhandled = plan.sources.find((source) => source.status === "planned" && source.conversionStatus !== "not-needed" && source.conversionStatus !== "converted");
  if (!unhandled) return undefined;
  if (unhandled.conversionStatus === "missing-tool") return new IngestMarkerMissingError(message);
  if (unhandled.conversionStatus === "timeout") return new IngestConversionTimeoutError(message);
  if (unhandled.conversionStatus === "failed") return new IngestConversionFailedError(message);
  if (unhandled.conversionStatus === "missing-output") return new IngestConversionMissingOutputError(message);
  if (unhandled.conversionStatus === "unsupported") return new IngestConversionUnsupportedFileError(message);
  if (unhandled.conversionStatus === "unsafe-output") return new IngestConversionUnsafeOutputError(message);
  return undefined;
}

async function writePlan(root: string, plan: IngestPlanSidecar): Promise<void> {
  await mkdir(path.join(root, INGEST_PLAN_DIR), { recursive: true });
  await atomicWriteText(root, `${INGEST_PLAN_DIR}/${plan.planId}.json`, stableJson(plan));
}

async function writeMarkdownPlan(root: string, plan: IngestPlanSidecar): Promise<void> {
  await atomicWriteText(root, `${INGEST_PLAN_DIR}/${plan.planId}.md`, renderMarkdownPlan(plan));
}

function result(root: string, plan: IngestPlanSidecar, validationFailures?: string[]): IngestCommandResult {
  return {
    root,
    planPath: `${INGEST_PLAN_DIR}/${plan.planId}.json`,
    markdownPath: `${INGEST_PLAN_DIR}/${plan.planId}.md`,
    plan,
    ...(validationFailures ? { validationFailures } : {})
  };
}

function renderMarkdownPlan(plan: IngestPlanSidecar): string {
  const lines = [
    "---",
    "type: ingest-plan",
    `planId: ${plan.planId}`,
    `planStatus: ${plan.planStatus}`,
    `created: ${plan.createdAt}`,
    `updated: ${plan.updatedAt}`,
    "---",
    `# Ingest Plan ${plan.planId}`,
    "",
    "## Summary",
    "",
    `- Discovered: ${plan.summaryCounts.discovered}`,
    `- Planned: ${plan.summaryCounts.planned}`,
    `- Summarized: ${plan.summaryCounts.summarized}`,
    `- Merged: ${plan.summaryCounts.merged}`,
    `- Skipped: ${plan.summaryCounts.skipped}`,
    `- Deferred: ${plan.summaryCounts.deferred}`,
    `- Changed: ${plan.summaryCounts.changed}`,
    `- Missing summaries: ${plan.summaryCounts.missingSummaries}`,
    `- Validation failures: ${plan.summaryCounts.validationFailures}`,
    "",
    "## Raw Roots",
    "",
    ...plan.rawRoots.map((rawRoot) => `- ${rawRoot}`),
    "",
    "## Batches",
    ""
  ];
  for (const batch of plan.batches) {
    lines.push(`### ${batch.id}`, "", `- Estimated tokens: ${batch.estimatedTokens}`, `- Files: ${batch.rawPaths.length}`, "");
    for (const rawPath of batch.rawPaths) lines.push(`- ${rawPath}`);
    lines.push("");
  }
  lines.push("## Sources", "");
  for (const source of plan.sources) {
    lines.push(
      `### ${source.rawPath}`,
      "",
      `- ID: ${source.id}`,
      `- Status: ${source.status}`,
      `- SHA-256: ${source.sha256}`,
      `- Size: ${source.sizeBytes}`,
      `- Expected summary: ${source.expectedSummaryPath}`,
      `- Content kind: ${source.contentKind}`,
      ...(source.archivedRawPath ? [`- Archived raw: ${source.archivedRawPath}`] : []),
      `- Conversion: ${source.conversionStatus}`,
      ...(source.convertedMarkdownPath ? [`- Read for summary: ${source.convertedMarkdownPath}`] : []),
      ...(source.convertedAssetPaths && source.convertedAssetPaths.length > 0 ? [`- Converted assets: ${source.convertedAssetPaths.join(", ")}`] : []),
      ...(source.converterName ? [`- Converter: ${source.converterName}`] : []),
      ...(source.conversionError ? [`- Conversion note: ${source.conversionError}`] : []),
      `- Preserve provenance: ${source.rawPath} (${source.sha256})`,
      ...(source.reason ? [`- Reason: ${source.reason}`] : []),
      ...(source.extractorMetadata
        ? [
            `- Extractor: ${source.extractorMetadata.extractorName}`,
            `- Complexity: ${source.extractorMetadata.complexity}`,
            `- Topics: ${source.extractorMetadata.roughTopics.join(", ") || "none"}`
          ]
        : []),
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function summarize(sources: IngestSource[], root: string, validationFailures = 0): IngestSummaryCounts {
  const counts: IngestSummaryCounts = {
    discovered: sources.length,
    planned: 0,
    summarized: 0,
    merged: 0,
    skipped: 0,
    deferred: 0,
    changed: 0,
    missingSummaries: 0,
    validationFailures
  };
  for (const source of sources) {
    counts[source.status] += 1;
    if ((source.status === "summarized" || source.status === "merged") && !pathExistsSyncFast(path.join(root, source.expectedSummaryPath))) {
      counts.missingSummaries += 1;
    }
  }
  return counts;
}

function pathExistsSyncFast(target: string): boolean {
  try {
    statSync(target);
    return true;
  } catch {
    return false;
  }
}

function planBatches(sources: IngestSource[]): IngestBatch[] {
  const batches: IngestBatch[] = [];
  let current: IngestSource[] = [];
  let currentTokens = 0;
  for (const source of [...sources].sort((a, b) => a.rawPath.localeCompare(b.rawPath))) {
    const estimated = estimatedTokens(source);
    if (current.length > 0 && (current.length >= BATCH_MAX_FILES || currentTokens + estimated > BATCH_TARGET_TOKENS)) {
      batches.push(batchFromSources(batches.length + 1, current, currentTokens));
      current = [];
      currentTokens = 0;
    }
    current.push(source);
    currentTokens += estimated;
  }
  if (current.length > 0) batches.push(batchFromSources(batches.length + 1, current, currentTokens));
  return batches;
}

function batchFromSources(index: number, sources: IngestSource[], estimatedTokensValue: number): IngestBatch {
  return {
    id: `batch-${String(index).padStart(3, "0")}`,
    sourceIds: sources.map((source) => source.id),
    rawPaths: sources.map((source) => source.rawPath),
    estimatedTokens: estimatedTokensValue,
    targetTokenBudget: BATCH_TARGET_TOKENS
  };
}

function estimatedTokens(source: IngestSource): number {
  return source.extractorMetadata?.estimatedTokens ?? Math.max(1, Math.ceil(source.sizeBytes / 4));
}

async function markDriftedSources(root: string, plan: IngestPlanSidecar): Promise<boolean> {
  let changed = false;
  for (const source of plan.sources) {
    if (source.status === "skipped" || source.status === "deferred") continue;
    const fullPath = await sourceStoragePath(root, source);
    if (!fullPath) continue;
    const currentHash = await sha256File(fullPath);
    if (currentHash !== source.sha256 && source.status !== "changed") {
      source.status = "changed";
      source.lastMarkedAt = currentIso();
      changed = true;
    }
  }
  return changed;
}

async function failOnDrift(root: string, plan: IngestPlanSidecar, source: IngestSource): Promise<void> {
  const fullPath = await sourceStoragePath(root, source);
  if (!fullPath) throw new IngestRawDriftError(`${source.rawPath} is missing from raw evidence.`);
  const currentHash = await sha256File(fullPath);
  if (currentHash !== source.sha256) {
    source.status = "changed";
    source.lastMarkedAt = currentIso();
    plan.summaryCounts = summarize(plan.sources, root);
    plan.updatedAt = currentIso();
    await writePlan(root, plan);
    await writeMarkdownPlan(root, plan);
    throw new IngestRawDriftError(`${source.rawPath} hash changed since planning.`);
  }
}

async function sourceStoragePath(root: string, source: IngestSource): Promise<string | undefined> {
  if (source.archivedRawPath) {
    const archivedPath = path.join(root, source.archivedRawPath);
    if (await pathExists(archivedPath)) return archivedPath;
  }
  const rawPath = path.join(root, source.rawPath);
  if (await pathExists(rawPath)) return rawPath;
  return undefined;
}

async function archiveRawSource(root: string, source: IngestSource): Promise<string> {
  if (source.archivedRawPath && (await pathExists(path.join(root, source.archivedRawPath)))) return source.archivedRawPath;
  const currentPath = path.join(root, source.rawPath);
  if (!(await pathExists(currentPath))) {
    if (source.archivedRawPath) return source.archivedRawPath;
    throw new IngestRawDriftError(`${source.rawPath} is missing from raw evidence.`);
  }
  const relativeFromRaw = toPosixPath(path.relative("raw", source.rawPath));
  const baseArchivePath = `${INGEST_ARCHIVE_DIR}/${relativeFromRaw}`;
  const archivePath = await availableArchivePath(root, baseArchivePath, source.sha256);
  await mkdir(path.dirname(path.join(root, archivePath)), { recursive: true });
  await rename(currentPath, path.join(root, archivePath));
  return archivePath;
}

async function archiveMergedRawSources(root: string, plan: IngestPlanSidecar): Promise<boolean> {
  let changed = false;
  for (const source of plan.sources) {
    if (source.status !== "merged") continue;
    const archivedRawPath = await archiveRawSource(root, source);
    if (source.archivedRawPath !== archivedRawPath) {
      source.archivedRawPath = archivedRawPath;
      changed = true;
    }
  }
  return changed;
}

async function availableArchivePath(root: string, archivePath: string, sha256: string): Promise<string> {
  if (!(await pathExists(path.join(root, archivePath)))) return archivePath;
  const extension = path.extname(archivePath);
  const withoutExtension = archivePath.slice(0, archivePath.length - extension.length);
  const candidate = `${withoutExtension}-${sha256.slice(0, 8)}${extension}`;
  if (!(await pathExists(path.join(root, candidate)))) return candidate;
  let suffix = 2;
  while (await pathExists(path.join(root, `${withoutExtension}-${sha256.slice(0, 8)}-${suffix}${extension}`))) {
    suffix += 1;
  }
  return `${withoutExtension}-${sha256.slice(0, 8)}-${suffix}${extension}`;
}

function isLegalTransition(current: IngestSourceStatus, target: IngestMarkStatus): boolean {
  if (current === "planned") return target === "summarized" || target === "skipped" || target === "deferred";
  if (current === "summarized") return target === "merged";
  if (current === "deferred") return target === "summarized";
  return false;
}

async function durableWikiCitations(root: string): Promise<Set<string>> {
  const pages = await listMarkdownFiles(root, "wiki");
  const cited = new Set<string>();
  for (const page of pages) {
    if (page.startsWith("wiki/sources/") || page.startsWith("wiki/templates/") || page.startsWith(`${LEGACY_INGEST_PLAN_DIR}/`)) continue;
    const body = await readText(path.join(root, page));
    for (const match of body.matchAll(/wiki\/sources\/[A-Za-z0-9._/-]+\.md/g)) {
      cited.add(match[0]);
    }
    for (const match of body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      const link = match[1] ?? "";
      if (link.startsWith("wiki/sources/")) cited.add(link.endsWith(".md") ? link : `${link}.md`);
      if (!link.includes("/")) cited.add(`wiki/sources/${link.endsWith(".md") ? link : `${link}.md`}`);
    }
  }
  return cited;
}

function expectedSummaryPaths(inventory: RawInventoryEntry[]): Map<string, string> {
  const grouped = new Map<string, RawInventoryEntry[]>();
  for (const entry of inventory) {
    const slug = baseSourceSlug(entry.rawPath);
    const existing = grouped.get(slug);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(slug, [entry]);
    }
  }
  const paths = new Map<string, string>();
  for (const [slug, entries] of grouped.entries()) {
    for (const entry of entries) {
      paths.set(entry.rawPath, summaryPathForSlug(slug, entries.length > 1 ? entry.sha256 : undefined));
    }
  }
  return paths;
}

function summaryPathForSlug(slug: string, sha256?: string): string {
  return `wiki/sources/${sha256 ? `${slug}-${sha256.slice(0, 8)}` : slug}.md`;
}

function baseSourceSlug(rawPath: string): string {
  const withoutExtension = rawPath.replace(/\.[^/.]+$/, "");
  const slug = withoutExtension
    .replace(/^raw\//, "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return truncateSlug(slug, 80) || "source";
}

function truncateSlug(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("").replace(/-+$/g, "");
}

function contentKind(fileName: string): IngestContentKind {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".txt" || extension === ".text") return "text";
  return "unknown";
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function dedupeByRawPath(entries: RawInventoryEntry[]): RawInventoryEntry[] {
  return [...new Map(entries.map((entry) => [entry.rawPath, entry])).values()];
}

async function makePlanId(root: string, now: string): Promise<string> {
  const base = `ingest-${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace(/[TZ]/g, "-").replace(/-$/, "")}`;
  let candidate = base;
  let suffix = 2;
  while (
    (await pathExists(path.join(root, INGEST_PLAN_DIR, `${candidate}.json`))) ||
    (await pathExists(path.join(root, LEGACY_INGEST_PLAN_DIR, `${candidate}.json`)))
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function currentIso(): string {
  return process.env.LLM_WIKI_SKILLS_NOW ?? new Date().toISOString();
}

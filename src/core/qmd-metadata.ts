import { createHash } from "node:crypto";
import path from "node:path";
import type { ManifestIntegrations, QmdModelMetadata, QmdRuntimeMode, QmdSearchMode } from "./types.js";

export const QMD_DOCS_PATH = "docs/llm-wiki-qmd.md";
export const QMD_MODEL_CACHE_PATH = "~/.cache/qmd/models/";
export const QMD_MODELS: QmdModelMetadata[] = [
  { name: "embeddinggemma-300M-Q8_0", purpose: "embedding", size: "~300MB" },
  { name: "qwen3-reranker-0.6b-q8_0", purpose: "reranking", size: "~640MB" },
  { name: "qmd-query-expansion-1.7B-q4_k_m", purpose: "query-expansion", size: "~1.1GB" }
];

export function qmdGeneratedFilePaths(): string[] {
  return [QMD_DOCS_PATH];
}

export function qmdCollectionName(root: string): string {
  const normalized = path.resolve(root);
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `llm-wiki-${digest}`;
}

export interface QmdIntegrationMetadataOptions {
  collection?: string;
  fallbackReason?: string;
  indexedAt?: string;
  runtimeMode?: QmdRuntimeMode;
  searchMode?: QmdSearchMode;
}

export function qmdIntegrationMetadata(root: string, options: QmdIntegrationMetadataOptions = {}): NonNullable<ManifestIntegrations["qmd"]> {
  const searchMode = options.searchMode ?? "hybrid";
  const runtimeMode = options.runtimeMode ?? "gpu-auto";
  return {
    enabled: true,
    schemaVersion: 2,
    collection: options.collection ?? qmdCollectionName(root),
    root: path.resolve(root),
    docsPath: QMD_DOCS_PATH,
    searchMode,
    runtimeMode,
    models: QMD_MODELS,
    modelCachePath: QMD_MODEL_CACHE_PATH,
    ...(options.indexedAt ? { lastIndexedAt: options.indexedAt } : {}),
    ...(searchMode === "hybrid" && options.indexedAt ? { lastEmbeddedAt: options.indexedAt } : {}),
    ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {})
  };
}

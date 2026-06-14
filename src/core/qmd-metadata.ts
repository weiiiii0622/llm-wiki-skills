import { createHash } from "node:crypto";
import path from "node:path";
import type { ManifestIntegrations } from "./types.js";

export const QMD_DOCS_PATH = "docs/llm-wiki-qmd.md";

export function qmdGeneratedFilePaths(): string[] {
  return [QMD_DOCS_PATH];
}

export function qmdCollectionName(root: string): string {
  const normalized = path.resolve(root);
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `llm-wiki-${digest}`;
}

export function qmdIntegrationMetadata(root: string, indexedAt?: string): NonNullable<ManifestIntegrations["qmd"]> {
  return {
    enabled: true,
    schemaVersion: 1,
    collection: qmdCollectionName(root),
    root: path.resolve(root),
    docsPath: QMD_DOCS_PATH,
    searchMode: "keyword",
    ...(indexedAt ? { lastIndexedAt: indexedAt } : {})
  };
}

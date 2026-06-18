import path from "node:path";
import { QmdCommandError } from "./errors.js";
import { ExecFileQmdRunner, type QmdRunner } from "./qmd.js";
import type { AtlasSearchDocument } from "./web-export.js";

export interface AtlasSearchResult {
  id: string;
  title: string;
  path: string;
  score: number;
  snippet: string;
  source: "qmd" | "text";
}

export interface AtlasSearchResponse {
  mode: "qmd" | "text";
  fallbackReason?: string;
  results: AtlasSearchResult[];
}

export interface AtlasSearchOptions {
  runner?: QmdRunner;
  timeoutMs?: number;
}

export async function searchAtlas(
  root: string,
  query: string,
  index: AtlasSearchDocument[],
  qmdAvailable: boolean,
  options: AtlasSearchOptions = {}
): Promise<AtlasSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) return { mode: "text", results: [] };
  if (!qmdAvailable) return { mode: "text", fallbackReason: "qmd disabled", results: searchTextIndex(index, trimmed) };
  const runner = options.runner ?? new ExecFileQmdRunner();
  try {
    const qmd = await withTimeout(runQmdSearch(root, trimmed, runner), options.timeoutMs ?? 2500);
    const results = normalizeQmdResults(qmd.stdout, index);
    if (results.length === 0) return { mode: "qmd", results: [] };
    return { mode: "qmd", results };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { mode: "text", fallbackReason: message, results: searchTextIndex(index, trimmed) };
  }
}

export function searchTextIndex(index: AtlasSearchDocument[], query: string): AtlasSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return index
    .map((doc) => {
      let score = 0;
      const haystack = `${doc.title.toLowerCase()} ${doc.path.toLowerCase()} ${doc.tags.join(" ").toLowerCase()} ${doc.text}`;
      for (const term of terms) {
        if (doc.title.toLowerCase().includes(term)) score += 12;
        if (doc.path.toLowerCase().includes(term)) score += 6;
        if (doc.tags.some((tag) => tag.toLowerCase().includes(term))) score += 4;
        const matches = haystack.split(term).length - 1;
        score += Math.min(matches, 8);
      }
      return {
        id: doc.id,
        title: doc.title,
        path: doc.path,
        score,
        snippet: snippet(doc.text, terms),
        source: "text" as const
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 20);
}

async function runQmdSearch(root: string, query: string, runner: QmdRunner): Promise<{ stdout: string; stderr: string }> {
  const cwd = path.resolve(root);
  try {
    return await runner.run("qmd", ["query", "--json", query], cwd, { suppressOutput: true });
  } catch {
    return await runner.run("qmd", ["search", "--json", query], cwd, { suppressOutput: true });
  }
}

function normalizeQmdResults(stdout: string, index: AtlasSearchDocument[]): AtlasSearchResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new QmdCommandError("qmd returned malformed JSON");
  }
  const rawResults = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : Array.isArray((parsed as { matches?: unknown }).matches)
        ? (parsed as { matches: unknown[] }).matches
        : Array.isArray((parsed as { items?: unknown }).items)
          ? (parsed as { items: unknown[] }).items
          : [];
  const byId = new Map(index.map((doc) => [doc.id, doc]));
  const byPath = new Map(index.map((doc) => [doc.path, doc]));
  return rawResults
    .map((item, position) => normalizeQmdItem(item, position, byId, byPath))
    .filter((item): item is AtlasSearchResult => item !== undefined)
    .slice(0, 20);
}

function normalizeQmdItem(
  item: unknown,
  position: number,
  byId: Map<string, AtlasSearchDocument>,
  byPath: Map<string, AtlasSearchDocument>
): AtlasSearchResult | undefined {
  if (!item || typeof item !== "object") return undefined;
  const record = item as Record<string, unknown>;
  const rawId = stringValue(record.id) ?? stringValue(record.nodeId);
  const rawPath = stringValue(record.path) ?? stringValue(record.file) ?? stringValue(record.source);
  const normalizedPath = rawPath?.replace(/^\.\//, "");
  const doc = (rawId ? byId.get(rawId) : undefined) ?? (normalizedPath ? byPath.get(normalizedPath) : undefined);
  if (!doc) return undefined;
  const score = numberValue(record.score) ?? numberValue(record.rank) ?? 100 - position;
  return {
    id: doc.id,
    title: doc.title,
    path: doc.path,
    score,
    snippet: stringValue(record.snippet) ?? stringValue(record.text) ?? snippet(doc.text, [doc.title.toLowerCase().split(/\s+/)[0] ?? ""]),
    source: "qmd"
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new QmdCommandError(`qmd search timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const first = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, first - 80);
  return text.slice(start, start + 220).trim();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

import path from "node:path";
import { InvalidFrontmatterError } from "./errors.js";
import { toPosixPath } from "./path-guard.js";

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractFrontmatter(markdown: string, filePath: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!markdown.startsWith("---\n")) {
    return { frontmatter: {}, body: markdown };
  }
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) {
    throw new InvalidFrontmatterError(`Unclosed frontmatter in ${filePath}`);
  }
  const raw = markdown.slice(4, end).trimEnd();
  const body = markdown.slice(end + 4).replace(/^\n/, "");
  return { frontmatter: parseSimpleYaml(raw, filePath), body };
}

export function parseSimpleYaml(raw: string, filePath: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split(/\r?\n/);
  let currentKey: string | undefined;
  for (const line of lines) {
    if (!line.trim()) continue;
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      const current = result[currentKey];
      if (!Array.isArray(current)) {
        throw new InvalidFrontmatterError(`List item without list key in ${filePath}: ${line}`);
      }
      current.push(unquote(listMatch[1].trim()));
      continue;
    }
    const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!keyMatch) {
      throw new InvalidFrontmatterError(`Unsupported frontmatter line in ${filePath}: ${line}`);
    }
    const [, key, value] = keyMatch;
    currentKey = key;
    if (value === "") {
      result[key] = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      result[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => unquote(item.trim()))
        .filter(Boolean);
    } else {
      result[key] = unquote(value);
    }
  }
  return result;
}

export function extractWikilinks(markdown: string): string[] {
  const links = new Set<string>();
  const regex = /\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const target = match[1].trim();
    if (target) links.add(target);
  }
  return [...links].sort();
}

export function titleFromPath(relativePath: string): string {
  const base = path.basename(relativePath, ".md");
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function pageIdFromPath(relativePath: string): string {
  return toPosixPath(relativePath).replace(/^wiki\//, "").replace(/\.md$/, "");
}

export function frontmatterArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

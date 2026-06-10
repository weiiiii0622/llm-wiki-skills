import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureSafeWritePath, toPosixPath } from "./path-guard.js";

export async function pathExists(target: string): Promise<boolean> {
  return stat(target).then(() => true, () => false);
}

export async function readText(target: string): Promise<string> {
  return readFile(target, "utf8");
}

export async function writeTextIfAbsent(root: string, relativePath: string, content: string, allowRaw = false): Promise<"created" | "skipped"> {
  const target = await ensureSafeWritePath(root, relativePath, allowRaw);
  if (await pathExists(target)) return "skipped";
  await writeFile(target, content, "utf8");
  return "created";
}

export async function atomicWriteText(root: string, relativePath: string, content: string, allowRaw = false): Promise<void> {
  const target = await ensureSafeWritePath(root, relativePath, allowRaw);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content, "utf8");
  await rename(temp, target);
}

export async function listMarkdownFiles(root: string, relativeDir: string): Promise<string[]> {
  const start = path.join(root, relativeDir);
  if (!(await pathExists(start))) return [];
  const found: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        found.push(toPosixPath(path.relative(root, full)));
      }
    }
  }
  await walk(start);
  return found.sort();
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortKeys(child)])
    );
  }
  return value;
}

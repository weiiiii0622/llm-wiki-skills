import { mkdir, lstat } from "node:fs/promises";
import path from "node:path";
import { ImmutableRawViolationError, WriteConflictError } from "./errors.js";

export function normalizeRoot(root: string): string {
  return path.resolve(root);
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function assertInsideRoot(root: string, candidate: string): string {
  const resolvedRoot = normalizeRoot(root);
  const resolvedCandidate = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new WriteConflictError(`Refusing to access path outside vault: ${candidate}`);
  }
  return resolvedCandidate;
}

export function assertMutablePath(root: string, candidate: string, allowRaw = false): string {
  const resolved = assertInsideRoot(root, candidate);
  const relative = toPosixPath(path.relative(normalizeRoot(root), resolved));
  if (!allowRaw && (relative === "raw" || relative.startsWith("raw/"))) {
    throw new ImmutableRawViolationError(`Refusing to mutate immutable raw path: ${relative}`);
  }
  return resolved;
}

export async function ensureSafeWritePath(root: string, relativePath: string, allowRaw = false): Promise<string> {
  const resolved = assertMutablePath(root, relativePath, allowRaw);
  await mkdir(path.dirname(resolved), { recursive: true });
  let current = path.dirname(resolved);
  const resolvedRoot = normalizeRoot(root);
  while (path.relative(resolvedRoot, current) !== "") {
    const stat = await lstat(current).catch(() => undefined);
    if (stat?.isSymbolicLink()) {
      throw new WriteConflictError(`Refusing to write through symlinked directory: ${current}`);
    }
    current = path.dirname(current);
  }
  const existing = await lstat(resolved).catch(() => undefined);
  if (existing?.isSymbolicLink()) {
    throw new WriteConflictError(`Refusing to overwrite symlink: ${relativePath}`);
  }
  return resolved;
}

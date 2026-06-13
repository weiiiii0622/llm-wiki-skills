import path from "node:path";
import { mkdir } from "node:fs/promises";
import { pathExists, writeTextIfAbsent } from "./fs.js";
import { VaultNotFoundError } from "./errors.js";

export interface VaultFileEntry {
  relativePath: string;
  content: string;
  allowRaw?: boolean;
}

export const REQUIRED_DIRECTORIES = [
  "raw/sources",
  "raw/notes",
  "raw/assets",
  "wiki/sources",
  "wiki/topics",
  "wiki/entities",
  "wiki/concepts",
  "wiki/questions",
  "wiki/templates",
  "docs"
] as const;

export async function assertVault(root: string): Promise<void> {
  const wiki = path.join(root, "wiki");
  const raw = path.join(root, "raw");
  if (!(await pathExists(wiki)) || !(await pathExists(raw))) {
    throw new VaultNotFoundError();
  }
}

export async function createVaultDirectories(root: string): Promise<void> {
  for (const directory of REQUIRED_DIRECTORIES) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
}

export async function createStarterFiles(root: string): Promise<Record<string, "created" | "skipped">> {
  const results: Record<string, "created" | "skipped"> = {};
  for (const entry of starterFileEntries()) {
    results[entry.relativePath] = await writeTextIfAbsent(root, entry.relativePath, entry.content, entry.allowRaw);
  }
  return results;
}

export async function createSharedReferenceFiles(root: string): Promise<Record<string, "created" | "skipped">> {
  const results: Record<string, "created" | "skipped"> = {};
  for (const entry of sharedReferenceFileEntries()) {
    results[entry.relativePath] = await writeTextIfAbsent(root, entry.relativePath, entry.content, entry.allowRaw);
  }
  return results;
}

export function sharedReferenceFilePaths(): string[] {
  return sharedReferenceFileEntries().map((entry) => entry.relativePath);
}

export function starterFilePaths(): string[] {
  return starterFileEntries().map((entry) => entry.relativePath);
}

export function starterFileEntries(): VaultFileEntry[] {
  return Object.entries(starterFiles()).map(([relativePath, content]) => ({
    relativePath,
    content,
    allowRaw: relativePath.startsWith("raw/")
  }));
}

export function sharedReferenceFileEntries(): VaultFileEntry[] {
  return Object.entries(sharedReferenceFiles()).map(([relativePath, content]) => ({
    relativePath,
    content
  }));
}

function starterFiles(): Record<string, string> {
  const today = process.env.LLM_WIKI_SKILLS_NOW?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  return {
    "wiki/index.md": `---
type: index
status: reviewed
created: ${today}
updated: ${today}
sources: []
tags:
  - llm-wiki
---
# Wiki Index

## Overview

- [[overview]]

## Sources

No sources ingested yet.

## Topics

No topics ingested yet.
`,
    "wiki/log.md": `---
type: log
status: reviewed
created: ${today}
updated: ${today}
sources: []
tags:
  - llm-wiki
---
# Wiki Log

- ${today}: Initialized vault with llm-wiki-skills.
`,
    "wiki/overview.md": `---
type: overview
status: draft
created: ${today}
updated: ${today}
sources: []
tags:
  - llm-wiki
---
# Overview

This vault stores durable, source-grounded knowledge as clean markdown pages that compound over time.

## Starting Points

Ingest a source to create the first source and topic pages.
`,
    "wiki/templates/source.md": template("source", today),
    "wiki/templates/topic.md": template("topic", today),
    "wiki/templates/entity.md": template("entity", today),
    "wiki/templates/concept.md": template("concept", today),
    "wiki/templates/question.md": template("question", today)
  };
}

function sharedReferenceFiles(): Record<string, string> {
  return {
    "docs/llm-wiki-contract.md": `# LLM Wiki Contract

This repository is a local-first LLM wiki vault.

## Directories

- \`raw/\` stores preserved source evidence and notes.
- \`wiki/\` stores durable synthesis as markdown pages.
- \`wiki/sources/\` summarizes individual source units.
- \`wiki/topics/\`, \`wiki/entities/\`, \`wiki/concepts/\`, and \`wiki/questions/\` store reusable knowledge pages.
- Topic scaffolds may add additional \`wiki/\` category directories and \`docs/llm-wiki-routing.md\`.
- \`docs/\` stores vault operating references.

## Page Rules

- Wiki pages use YAML frontmatter.
- Pages stay source-grounded and link back to source pages.
- Obsidian wikilinks are allowed for relationships between wiki pages.
- Existing synthesis should be updated before creating duplicate pages.
- Contradictions and stale claims should be called out instead of hidden.
`,
    "docs/llm-wiki-workflows.md": `# LLM Wiki Workflows

## Ingest

1. Preserve source material under \`raw/sources/\` or \`raw/notes/\` when needed.
2. Create source summaries under \`wiki/sources/\`.
3. Read \`docs/llm-wiki-routing.md\` when present to choose the right \`wiki/\` category.
4. Search existing synthesis before adding new pages.
5. Update overlapping topic, entity, concept, question, or topic-specific category pages.
6. Flag contradictions when new sources challenge older claims.
7. Update \`wiki/index.md\` and \`wiki/log.md\`.

## Query

1. Read \`wiki/index.md\`.
2. Read \`docs/llm-wiki-routing.md\` when present.
3. Search \`wiki/\` for relevant source and synthesis pages.
4. Read source pages before relying on claims.
5. Answer with citations to wiki page paths.
6. Save useful answers under \`wiki/questions/\` or another appropriate wiki section when they should compound into future work.

## Lint

1. Look for contradictions and stale claims superseded by newer sources.
2. Find orphan pages, missing cross-references, and duplicated topics.
3. Identify important mentioned concepts, entities, or questions that need pages.
4. List data gaps that need follow-up questions, new sources, or web research.
5. Check basic structure issues such as missing frontmatter, broken wikilinks, or uncited claims.
`
  };
}

function template(type: string, today: string): string {
  return `---
type: template
templateFor: ${type}
status: draft
created: ${today}
updated: ${today}
sources: []
tags:
  - llm-wiki
---
# ${type.charAt(0).toUpperCase() + type.slice(1)} Title

## Summary

## Sources
`;
}

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { pathExists, writeTextIfAbsent } from "./fs.js";
import { VaultNotFoundError } from "./errors.js";

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
  for (const [relativePath, content] of Object.entries(starterFiles())) {
    results[relativePath] = await writeTextIfAbsent(root, relativePath, content, relativePath.startsWith("raw/"));
  }
  return results;
}

export async function createSharedReferenceFiles(root: string): Promise<Record<string, "created" | "skipped">> {
  const results: Record<string, "created" | "skipped"> = {};
  for (const [relativePath, content] of Object.entries(sharedReferenceFiles())) {
    results[relativePath] = await writeTextIfAbsent(root, relativePath, content);
  }
  return results;
}

export function sharedReferenceFilePaths(): string[] {
  return Object.keys(sharedReferenceFiles());
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

This vault stores durable, source-grounded knowledge as clean markdown pages and a generated graph sidecar.

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
- \`docs/\` stores vault operating references.

## Page Rules

- Wiki pages use YAML frontmatter.
- Pages stay source-grounded and link back to source pages.
- Obsidian wikilinks are allowed for relationships between wiki pages.
- Existing synthesis should be updated before creating duplicate pages.
`,
    "docs/llm-wiki-workflows.md": `# LLM Wiki Workflows

## Ingest

1. Preserve source material under \`raw/sources/\` or \`raw/notes/\` when needed.
2. Create source summaries under \`wiki/sources/\`.
3. Search existing synthesis before adding new pages.
4. Update overlapping topic, entity, concept, or question pages.
5. Update \`wiki/index.md\` and \`wiki/log.md\`.

## Query

1. Read \`wiki/index.md\`.
2. Search \`wiki/\` for relevant source and synthesis pages.
3. Read source pages before relying on claims.
4. Answer with citations to wiki page paths.
5. Save answers under \`wiki/questions/\` only when durable storage is requested.

## Lint

1. Check frontmatter and required metadata.
2. Confirm wikilinks point to intended pages.
3. Confirm new claims cite source pages.
4. Confirm raw evidence was not changed without explicit user direction.
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

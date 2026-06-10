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
  "docs",
  "tools/ingest",
  "tools/lint",
  "tools/search"
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
    "wiki/templates/question.md": template("question", today),
    "docs/tools-and-skills.md": `# Tools and Skills

Use \`llm-wiki-skills init\` to create the vault contract, \`llm-wiki-skills graph\` to regenerate graph sidecars, \`llm-wiki-skills lint\` for hard failures, and \`llm-wiki-skills health\` for a vault summary.
`,
    "docs/maintenance-checklist.md": `# Maintenance Checklist

- Preserve files under \`raw/\` unless the user explicitly asks for source cleanup.
- Update existing topic pages when new source material overlaps.
- Run \`llm-wiki-skills graph\` after page edits.
- Run \`llm-wiki-skills lint\` before sharing durable results.
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

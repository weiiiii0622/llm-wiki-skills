import type { HostAdapter } from "../core/types.js";

export function codexAdapter(): HostAdapter {
  return {
    id: "codex",
    label: "Codex",
    skillRoot: ".codex/skills",
    skills: [
      {
        name: "llm-wiki-ingest",
        content: `# LLM Wiki Ingest

Use this skill when adding source material to a local LLM wiki vault.

## Contract

- Preserve raw evidence under \`raw/\` unless the user explicitly requests cleanup.
- Keep durable synthesis in \`wiki/\` as Obsidian-compatible markdown.
- Search existing pages before creating new topics, entities, concepts, or questions.
- Prefer updating overlapping pages over creating duplicates.
- Cite source pages from frontmatter and body wikilinks.

## Workflow

1. Read \`docs/llm-wiki-contract.md\` and \`docs/llm-wiki-workflows.md\`.
2. Store original source files or notes under \`raw/sources/\` or \`raw/notes/\` when preservation is needed.
3. Create one source summary under \`wiki/sources/\` for each source unit.
4. Extract durable topics, entities, concepts, claims, examples, and open questions.
5. Update \`wiki/index.md\` and append \`wiki/log.md\` with the change.
6. Use the \`llm-wiki-lint\` skill to check the vault before handoff.
`
      },
      {
        name: "llm-wiki-query",
        content: `# LLM Wiki Query

Use this skill when answering questions against a local LLM wiki vault.

## Contract

- Read source-grounded pages before making factual claims.
- Separate sourced facts from inference.
- Call out missing or conflicting evidence.
- Preserve answers only when the user asks for durable storage.

## Workflow

1. Read \`wiki/index.md\` first.
2. Search \`wiki/\` with \`rg\` for relevant source and synthesis pages.
3. Read the source pages behind any claim you plan to use.
4. Answer with citations to wiki page paths.
5. If the answer should become durable, save it under \`wiki/questions/\`, update index/log files, and use the \`llm-wiki-lint\` skill.
`
      },
      {
        name: "llm-wiki-lint",
        content: `# LLM Wiki Lint

Use this skill before handing off durable edits to a local LLM wiki vault.

## Checks

- Every wiki page has YAML frontmatter.
- Frontmatter includes \`type\`, \`status\`, \`sources\`, and \`tags\` where relevant.
- Wikilinks point to existing pages or intentionally unresolved future pages.
- Raw evidence under \`raw/\` was not changed without explicit user direction.
- New synthesis is source-grounded and avoids duplicate topic pages.

## Workflow

1. Inspect changed files under \`wiki/\`, \`docs/\`, and \`raw/\`.
2. Verify linked source pages exist for new factual claims.
3. Search for duplicate or overlapping page titles.
4. Report concrete issues with file paths and fixes.
`
      }
    ]
  };
}

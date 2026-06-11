import type { HostAdapter } from "../core/types.js";

export function claudeCodeAdapter(): HostAdapter {
  return {
    id: "claude-code",
    label: "Claude Code",
    skillRoot: ".claude/skills",
    skills: [
      {
        name: "llm-wiki-ingest",
        content: `# LLM Wiki Ingest

Use this skill when adding source material to a local LLM wiki vault.

## Contract

- Treat \`raw/\` as preserved evidence unless the user explicitly asks for cleanup.
- Keep durable synthesis in \`wiki/\` with YAML frontmatter and Obsidian wikilinks.
- Search before creating new pages.
- Update overlapping pages before adding duplicates.
- Link claims back to source pages.

## Workflow

1. Read \`docs/llm-wiki-contract.md\` and \`docs/llm-wiki-workflows.md\`.
2. Place original files or notes under \`raw/sources/\` or \`raw/notes/\` when they should be retained.
3. Create source summaries under \`wiki/sources/\`.
4. Extract reusable topics, entities, concepts, claims, examples, and questions.
5. Update \`wiki/index.md\` and \`wiki/log.md\`.
6. Use the \`llm-wiki-lint\` skill to check the vault.
`
      },
      {
        name: "llm-wiki-query",
        content: `# LLM Wiki Query

Use this skill when answering questions against a local LLM wiki vault.

## Contract

- Start from the vault index.
- Read relevant source pages before relying on synthesis.
- Distinguish sourced facts from inference.
- Note uncertainty and source gaps.

## Workflow

1. Read \`wiki/index.md\`.
2. Search \`wiki/\` with \`rg\`.
3. Read matching source, topic, entity, concept, and question pages.
4. Answer with citations to wiki page paths.
5. If the user wants the answer preserved, save it under \`wiki/questions/\`, update index/log files, and use the \`llm-wiki-lint\` skill.
`
      },
      {
        name: "llm-wiki-lint",
        content: `# LLM Wiki Lint

Use this skill before finalizing durable local LLM wiki edits.

## Checks

- Wiki pages include parseable YAML frontmatter.
- Required metadata is present and consistent with the page type.
- Wikilinks resolve or are clearly intentional placeholders.
- Raw evidence was not edited without explicit user direction.
- New pages do not duplicate existing durable synthesis.

## Workflow

1. Review changed files under \`wiki/\`, \`docs/\`, and \`raw/\`.
2. Confirm factual claims are backed by source pages.
3. Search for near-duplicate topic names.
4. Return file-specific issues and suggested fixes.
`
      }
    ]
  };
}

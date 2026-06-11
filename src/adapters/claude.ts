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
- Treat the wiki as a persistent, compounding artifact, not a one-off summary.
- Search before creating new pages.
- Update overlapping pages before adding duplicates.
- Flag contradictions when new sources challenge older claims.
- Link claims back to source pages.

## Workflow

1. Read \`docs/llm-wiki-contract.md\` and \`docs/llm-wiki-workflows.md\`.
2. Place original files or notes under \`raw/sources/\` or \`raw/notes/\` when they should be retained.
3. Create source summaries under \`wiki/sources/\`.
4. Extract reusable topics, entities, concepts, claims, examples, contradictions, and questions.
5. Update related pages across \`wiki/topics/\`, \`wiki/entities/\`, \`wiki/concepts/\`, and \`wiki/questions/\`.
6. Update \`wiki/index.md\` and \`wiki/log.md\`.
7. Use the \`llm-wiki-lint\` skill to health-check the wiki.
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
- File useful answers back into the wiki when they should compound into future work.

## Workflow

1. Read \`wiki/index.md\`.
2. Search \`wiki/\` with \`rg\`.
3. Read matching source, topic, entity, concept, and question pages.
4. Answer with citations to wiki page paths.
5. If the user wants the answer preserved, save it under \`wiki/questions/\` or another appropriate wiki section.
6. Update \`wiki/index.md\`, append \`wiki/log.md\`, and use the \`llm-wiki-lint\` skill when new pages or claims are added.
`
      },
      {
        name: "llm-wiki-lint",
        content: `# LLM Wiki Lint

Use this skill to health-check a local LLM wiki as it grows.

## Checks

- Contradictions between pages or claims that newer sources have superseded.
- Stale summaries that no longer reflect the current source set.
- Orphan pages with no useful inbound or outbound links.
- Important concepts, entities, or questions mentioned without their own page.
- Missing cross-references between related source and synthesis pages.
- Data gaps that need more sources, follow-up questions, or web research.
- Basic structure issues such as missing frontmatter, broken wikilinks, or uncited claims.

## Workflow

1. Read \`wiki/index.md\` to understand the current map.
2. Review recent entries in \`wiki/log.md\` to see what changed lately.
3. Sample connected source, topic, entity, concept, and question pages.
4. Search for duplicated topics, unresolved mentions, stale claims, and contradictions.
5. Report concrete fixes with file paths, plus new questions or sources worth investigating.
`
      }
    ]
  };
}

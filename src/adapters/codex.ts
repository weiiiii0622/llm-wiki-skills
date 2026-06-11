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
- Treat the wiki as a persistent, compounding artifact, not a one-off summary.
- Search existing pages before creating new topics, entities, concepts, or questions.
- Prefer updating overlapping pages over creating duplicates.
- Flag contradictions when new sources challenge older claims.
- Cite source pages from frontmatter and body wikilinks.

## Workflow

1. Read \`docs/llm-wiki-contract.md\` and \`docs/llm-wiki-workflows.md\`.
2. Store original source files or notes under \`raw/sources/\` or \`raw/notes/\` when preservation is needed.
3. Create one source summary under \`wiki/sources/\` for each source unit.
4. Extract durable topics, entities, concepts, claims, examples, contradictions, and open questions.
5. Update related pages across \`wiki/topics/\`, \`wiki/entities/\`, \`wiki/concepts/\`, and \`wiki/questions/\`.
6. Update \`wiki/index.md\` and append \`wiki/log.md\` with the change.
7. Use the \`llm-wiki-lint\` skill to health-check the wiki before handoff.
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
- Preserve useful answers as wiki pages when they should compound into future work.

## Workflow

1. Read \`wiki/index.md\` first.
2. Search \`wiki/\` with \`rg\` for relevant source and synthesis pages.
3. Read the source pages behind any claim you plan to use.
4. Answer with citations to wiki page paths.
5. If the answer should become durable, save it under \`wiki/questions/\` or another appropriate wiki section.
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

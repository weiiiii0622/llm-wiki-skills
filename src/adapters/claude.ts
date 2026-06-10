export function claudeSkillContent(): string {
  return `# LLM Wiki Maintainer

Maintain this vault as a persistent, source-grounded markdown knowledge graph.

Default workflow:
1. Read \`wiki/index.md\` first.
2. Search the vault before creating new pages.
3. Preserve \`raw/\` unless the user explicitly asks for raw source migration.
4. Prefer updating existing topic pages over creating duplicate pages.
5. Regenerate graph sidecars with \`llm-wiki-skills graph\`.

## wiki-ingest

Use when adding source material to the vault.

1. Preserve original source files under \`raw/sources/\` or \`raw/notes/\` when requested.
2. Create source summary pages under \`wiki/sources/\`.
3. Extract durable topics, entities, concepts, claims, examples, and open questions.
4. Update overlapping existing pages before creating new ones.
5. Link pages with Obsidian wikilinks and source frontmatter.
6. Update indexes and logs, then run \`llm-wiki-skills graph\` and \`llm-wiki-skills lint\`.

## wiki-query

Use when answering questions against the vault.

1. Read \`wiki/index.md\`.
2. Search \`wiki/\` with \`rg\`.
3. Read the relevant source and synthesis pages.
4. Answer with page citations and separate sourced facts from inference.
5. If the answer should become durable, save it under \`wiki/questions/\`, update indexes/logs, then run graph and lint.
`;
}

export function claudeProjectInstructions(): string {
  return `# Claude Code Instructions

Use the local LLM wiki contract:
- pages live in \`wiki/\`;
- immutable evidence lives in \`raw/\`;
- generated graph sidecars are \`wiki/graph.json\` and \`wiki/graph.md\`;
- run \`llm-wiki-skills lint\` before finalizing durable wiki edits.
`;
}

export function codexSkillContent(): string {
  return `# LLM Wiki Maintainer

Use this skill when maintaining a markdown LLM wiki vault.

Rules:
- Preserve \`raw/\` as immutable evidence unless the user explicitly requests source cleanup.
- Keep wiki pages Obsidian-compatible and source-grounded.
- Update existing topic pages before creating duplicates.
- Run \`llm-wiki-skills graph\` after durable page edits.
- Run \`llm-wiki-skills lint\` before handing off substantial wiki changes.

## Workflows

### wiki-ingest

Use when the user asks to ingest, add, summarize, or file new source material.

1. Put original files or notes under \`raw/sources/\` or \`raw/notes/\` when the user wants them preserved.
2. Create one source summary page under \`wiki/sources/\` for each source unit.
3. Search \`wiki/\` before creating topic pages.
4. Update existing topic/entity/concept pages when the source overlaps existing knowledge.
5. Create a new page only when the topic is distinct and reusable.
6. Add source links in frontmatter and body wikilinks where they explain relationships.
7. Update \`wiki/index.md\`, append \`wiki/log.md\`, run \`llm-wiki-skills graph\`, then run \`llm-wiki-skills lint\`.

### wiki-query

Use when the user asks a question against the vault.

1. Read \`wiki/index.md\` first.
2. Search the vault with \`rg\` for relevant source, topic, entity, concept, and question pages.
3. Read source pages before making sourced claims.
4. Answer with citations to wiki pages and call out uncertainty or source gaps.
5. If the user asks to preserve the answer, file it under \`wiki/questions/\`, update \`wiki/index.md\`, append \`wiki/log.md\`, run \`llm-wiki-skills graph\`, then run \`llm-wiki-skills lint\`.
`;
}

export function codexAgentInstructions(): string {
  return `# LLM Wiki Vault

This repository uses \`llm-wiki-skills\`.

- Raw evidence lives in \`raw/\` and should not be modified without explicit user direction.
- Durable synthesis lives in \`wiki/\` with YAML frontmatter and Obsidian wikilinks.
- \`wiki/graph.json\` is the canonical generated graph sidecar.
- \`wiki/graph.md\` is the human-readable generated graph report.
- Run \`llm-wiki-skills health\`, \`llm-wiki-skills lint\`, and \`llm-wiki-skills graph\` for maintenance.
`;
}

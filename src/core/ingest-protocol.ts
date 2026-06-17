import { LLM_WIKI_CLI } from "./cli-command.js";

export const MULTI_FILE_INGEST_PROTOCOL = `## Multi-File Ingest Protocol

For folders with multiple raw files, use the CLI-owned ingest plan instead of tracking progress by memory:

1. Put retained evidence under \`raw/sources/\` or \`raw/notes/\`.
2. Use \`${LLM_WIKI_CLI}\` by default for CLI commands. If \`llm-wiki-skills\` is already on PATH, the bare command is fine.
3. Run \`${LLM_WIKI_CLI} ingest plan --root <vault>\` before summarizing a large raw folder.
4. Read \`wiki/ingest-plans/<planId>.md\` for source inventory, expected source-summary paths, and batches.
5. Create each source summary at the plan's expected \`wiki/sources/\` path and include the raw path plus SHA-256 hash from the plan.
6. Mark completed source summaries with \`${LLM_WIKI_CLI} ingest mark --root <vault> --plan <planId> --source <rawPath> --status summarized\`.
7. After durable wiki pages cite the source summary, mark the source merged with \`${LLM_WIKI_CLI} ingest mark --root <vault> --plan <planId> --source <rawPath> --status merged\`.
8. Use \`--status skipped --reason <text>\` or \`--status deferred --reason <text>\` only when a source should not be completed in the current pass.
9. Run \`${LLM_WIKI_CLI} ingest status --root <vault> --plan <planId>\` before resuming work and \`${LLM_WIKI_CLI} ingest validate --root <vault> --plan <planId>\` before final handoff.

Do not hand-edit \`wiki/ingest-plans/*.json\`; it is machine state owned by the CLI.`;

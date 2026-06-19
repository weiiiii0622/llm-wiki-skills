import { LLM_WIKI_CLI } from "./cli-command.js";

export const MULTI_FILE_INGEST_PROTOCOL = `## Multi-File Ingest Protocol

For folders with multiple raw files, use the CLI-owned ingest plan instead of tracking progress by memory:

1. Put retained evidence under \`raw/sources/\` or \`raw/notes/\`; \`raw/archieved/\` is reserved for completed ingest evidence and is skipped by planning.
2. Use \`${LLM_WIKI_CLI}\` by default for CLI commands. If \`llm-wiki-skills\` is already on PATH, the bare command is fine.
3. The ingest planner owns converter tools. It can use Marker to convert PDFs, DOCX, PPTX, spreadsheets, HTML, EPUB, and images into markdown during \`ingest plan\`; run \`${LLM_WIKI_CLI} ingest converters status --root <vault>\` if you need to check availability.
4. Do not try ad hoc PDF/OCR extraction tools first, such as \`pdfinfo\`, \`pdftotext\`, Poppler, \`pypdf\`, or \`pdfplumber\`. Run \`${LLM_WIKI_CLI} ingest plan --root <vault>\` first and read the converted markdown path it reports.
5. Run \`${LLM_WIKI_CLI} ingest plan --root <vault>\` before summarizing a large raw folder.
6. Read \`.llm-wiki-skills/ingest-plans/<planId>.md\` for source inventory, expected source-summary paths, batches, and conversion status.
7. When a source has \`Read for summary: .llm-wiki-skills/ingest-plans/<planId>/converted/...\`, read that converted markdown for content extraction.
8. If conversion status is \`missing-tool\`, \`failed\`, \`timeout\`, \`missing-output\`, \`unsupported\`, or \`oversized\`, report that status from the ingest plan and ask the user how to proceed instead of hunting for unrelated extractor packages.
9. Create each source summary at the plan's expected \`wiki/sources/\` path and include the original raw path plus SHA-256 hash from the plan, even when the content came from converted markdown.
10. Mark completed source summaries with \`${LLM_WIKI_CLI} ingest mark --root <vault> --plan <planId> --source <rawPath> --status summarized\`.
11. After durable wiki pages cite the source summary, mark the source merged with \`${LLM_WIKI_CLI} ingest mark --root <vault> --plan <planId> --source <rawPath> --status merged\`; the CLI moves the raw file to \`raw/archieved/\` while preserving original raw-path and SHA-256 provenance in the plan.
12. Use \`--status skipped --reason <text>\` or \`--status deferred --reason <text>\` only when a source should not be completed in the current pass.
13. Run \`${LLM_WIKI_CLI} ingest status --root <vault> --plan <planId>\` before resuming work and \`${LLM_WIKI_CLI} ingest validate --root <vault> --plan <planId>\` before final handoff.

Do not hand-edit \`.llm-wiki-skills/ingest-plans/*.json\`; it is machine state owned by the CLI.`;

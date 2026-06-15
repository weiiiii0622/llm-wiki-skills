export const QMD_QUERY_WORKFLOW_STEP = `If \`.llm-wiki-skills.json\` has \`integrations.qmd.enabled\`, choose the qmd command from metadata:
   - \`searchMode: "hybrid"\` and \`runtimeMode: "gpu-auto"\`: use \`qmd query --json\` for candidate discovery.
   - \`searchMode: "hybrid"\` and \`runtimeMode: "cpu-forced"\`: use \`QMD_FORCE_CPU=1 qmd query --json\` for candidate discovery.
   - \`searchMode: "keyword"\` or \`runtimeMode: "keyword-fallback"\`: use \`qmd search --json\` for full-text candidate discovery.
   qmd ranks candidates only; markdown remains the source of truth.`;

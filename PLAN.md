# General LLM-Wiki Agent Skillset Plan

## Purpose

Build a reusable AI-agent skillset for maintaining persistent markdown knowledge bases using the LLM-wiki pattern. The core idea is to turn source material, notes, conversations, and useful answers into a durable, interlinked wiki that compounds over time.

The skillset should help agents do the recurring maintenance work that makes a knowledge base useful:

- preserve raw sources as immutable evidence;
- create source summaries as citation anchors;
- maintain topic-first pages instead of source-shaped folders;
- update existing pages when new sources overlap old knowledge;
- keep indexes, logs, links, and metadata consistent;
- file durable answers back into the wiki;
- lint the wiki for drift, duplication, stale claims, and missing provenance.

This plan is intentionally domain-neutral. Project-specific terminology, safety rules, page categories, and source priorities should live in each project's local `AGENTS.md` or optional reference files, not in the core skillset.

## Design Principles

### Persistent Knowledge Over One-Off Retrieval

The wiki is a maintained artifact, not a transient retrieval result. Agents should synthesize once, store the synthesis, and update it when new evidence arrives.

### Raw Sources Are Immutable

The `raw/` layer is the source of truth. Agents may read it but should not modify it unless the user explicitly asks for source cleanup, renaming, or migration.

### Topic-First Graph

The wiki should be organized around reusable knowledge nodes, not around the shape of source files. A source page explains one source; topic pages integrate information across many sources.

### Overlap Maintenance

When new material discusses an existing topic, update the existing page. Create a new page only when the topic is distinct and useful enough to stand alone.

### Source Grounding

Durable claims should point back to source pages. If evidence is weak, conflicting, old, or uncertain, mark that explicitly instead of smoothing it over.

### Small, Parseable Control Files

`index.md` and `log.md` should stay simple enough for agents and shell tools to parse. Health reports should be repeatable and comparable over time.

### Progressive Skill Disclosure

The skillset should be compact at trigger time. Core skill instructions belong in `SKILL.md`; detailed templates, schemas, examples, and scripts belong in referenced files.

## Default Repository Contract

The default layout should work for a broad range of personal, research, team, and project knowledge bases:

```text
raw/
  sources/       # immutable source documents
  notes/         # user notes, transcripts, meeting notes, working notes
  assets/        # images, attachments, local media

wiki/
  index.md       # content catalog
  log.md         # append-only activity timeline
  overview.md    # top-level map and synthesis
  sources/       # one page per source or source section
  topics/        # durable topic pages
  entities/      # people, organizations, products, projects, places, objects
  concepts/      # ideas, models, frameworks, mechanisms
  questions/     # filed answers from useful queries
  templates/     # reusable page templates

docs/
  tools-and-skills.md
  maintenance-checklist.md
  health-check-YYYY-MM-DD.md

tools/
  ingest/
  lint/
  search/
```

Projects may add category directories, but the core skillset should not require domain-specific categories.

## Page Metadata Standard

Every generated wiki page should start with YAML frontmatter:

```yaml
---
type: topic
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources:
  - "[[source-page]]"
tags:
  - llm-wiki
---
```

Default page types:

- `overview`
- `index`
- `log`
- `source`
- `topic`
- `entity`
- `concept`
- `question`

Default statuses:

- `draft`
- `reviewed`
- `needs-source`
- `conflict`
- `stale`

Projects may extend these values in local instructions, but agents should avoid inventing new values casually.

## Skill Bundle

### `wiki-init`

Use when creating or normalizing a new LLM-wiki repository.

Responsibilities:

- create the default directory contract;
- create starter `wiki/index.md`, `wiki/log.md`, and `wiki/overview.md`;
- create templates for source, topic, entity, concept, and question pages;
- create `docs/tools-and-skills.md` and `docs/maintenance-checklist.md`;
- create or update local agent instructions describing the wiki contract;
- avoid overwriting existing user content without explicit approval.

Acceptance checks:

- required directories exist;
- required control files exist;
- templates include frontmatter;
- raw source directories are present and documented as immutable.

### `wiki-ingest`

Use when adding one or more new sources to the wiki.

Responsibilities:

- identify the source files or source sections to process;
- create one source summary page per source unit;
- extract durable topics, entities, concepts, decisions, claims, examples, and open questions;
- create new topic pages only when necessary;
- update existing pages when new material overlaps;
- add source links, related links, and unresolved questions;
- update indexes and append to the log.

Acceptance checks:

- every ingested source has a source page;
- affected topic pages list the new source page in frontmatter or source coverage;
- `wiki/index.md` and relevant category indexes include new pages;
- `wiki/log.md` has one append-only ingest entry;
- internal link check passes.

### `wiki-topic-merge`

Use when the wiki has duplicate, overlapping, or poorly scoped pages.

Responsibilities:

- detect candidate duplicates by title, aliases, source coverage, and incoming links;
- choose a canonical page using project naming conventions;
- merge source coverage and non-duplicative content;
- preserve aliases and redirect-style links where useful;
- mark unresolved conflicts instead of deleting uncertainty;
- update indexes and related links.

Acceptance checks:

- no broken links after merge;
- canonical page includes all relevant sources;
- old duplicate page is either removed, converted to an alias/redirect note, or explicitly marked as merged according to project policy;
- log records the maintenance action.

### `wiki-query`

Use when answering questions against the wiki.

Responsibilities:

- read `wiki/index.md` first;
- search with `rg` or the configured local search tool;
- read relevant source and topic pages before answering;
- cite wiki pages rather than unsupported memory;
- distinguish sourced synthesis from inference;
- file durable answers into `wiki/questions/` when the user asks or when local policy says to preserve them.

Acceptance checks for filed answers:

- question page has frontmatter and cited sources;
- indexes include the new page;
- log has a query entry;
- answer states uncertainty or source gaps clearly.

### `wiki-lint`

Use for quality audits and cleanup planning.

Responsibilities:

- find broken internal links;
- find pages missing from indexes;
- find source summaries not listed in source indexes;
- find pages with weak or missing source grounding;
- identify orphan pages and decide whether they are intentional;
- find duplicate or near-duplicate nodes;
- find stale, conflict, or needs-source pages;
- suggest concrete cleanup actions.

Acceptance checks:

- lint output separates hard failures from recommendations;
- any durable fixes update the relevant pages, indexes, and log;
- unresolved issues are documented in a health report or checklist.

### `wiki-health`

Use after ingests, large maintenance passes, or scheduled audits.

Responsibilities:

- count source pages and generated pages by type;
- run internal link validation;
- check index coverage;
- report pages by status;
- report newly added, heavily changed, orphaned, and unresolved pages;
- write a dated health-check file when the result should persist.

Acceptance checks:

- health report includes date, scope, status, counts, and warnings;
- zero broken links is the default pass criterion;
- non-zero warnings are either fixed or explicitly documented.

### `wiki-skill-maintainer`

Use when improving the skillset itself.

Responsibilities:

- capture repeated workflow lessons;
- move fragile repeated logic into scripts;
- keep `SKILL.md` concise and move details into references;
- add examples only when they reduce ambiguity;
- validate skills on small realistic tasks before relying on them broadly.

Acceptance checks:

- skill instructions are shorter than the accumulated project notes;
- scripts are deterministic and documented at the command level;
- references are loaded only when needed;
- local project rules remain separate from the general skill.

## Reusable Tooling Roadmap

### Phase 1: Minimal Deterministic Tools

Build small scripts that can be reused by all wiki projects:

- source discovery: list candidate source files and detect likely source units;
- slug generation: produce stable lowercase kebab-case filenames;
- frontmatter validation: ensure required fields and allowed values;
- link checking: verify Obsidian-style internal links resolve;
- index checking: identify pages missing from index files;
- log checking: validate parseable log headers;
- health reporting: produce a dated markdown report.

### Phase 2: Ingest Assistance

Add tools that help agents ingest consistently without forcing a fixed domain schema:

- source-to-summary skeleton generator;
- topic candidate extractor using headings, repeated terms, aliases, and explicit definitions;
- overlap detector using filename, aliases, headings, and source coverage;
- page updater that preserves frontmatter and existing sections;
- category index generator.

### Phase 3: Search and Review

Add optional tools for larger wikis:

- BM25 or hybrid markdown search;
- duplicate page candidate ranking;
- orphan graph report;
- source coverage matrix;
- stale claim report based on dates, statuses, or newer source links;
- multi-agent review prompts for independent linting.

## Agent Workflows

### Init Workflow

1. Inspect the current repository.
2. Create missing default directories and control files.
3. Add templates and local agent instructions.
4. Run health checks.
5. Commit only the initialized wiki files when the user requests a commit.

### Ingest Workflow

1. Identify source units.
2. Read the current index and relevant existing pages.
3. Create source summary pages.
4. Extract topic candidates.
5. Update existing pages before creating new ones.
6. Add related links and source coverage.
7. Update indexes and overview.
8. Append one log entry.
9. Run health checks.
10. Commit with a source-specific message if project policy requires commits.

### Query Workflow

1. Read `wiki/index.md`.
2. Search the wiki.
3. Read relevant topic and source pages.
4. Answer with citations and uncertainty labels.
5. File the answer if it is durable.
6. Update indexes and log if filed.

### Lint Workflow

1. Run deterministic checks first.
2. Inspect sampled pages manually.
3. Classify findings as failures, warnings, or suggestions.
4. Fix high-confidence mechanical issues.
5. Create follow-up tasks for ambiguous or project-specific decisions.
6. Append a lint or maintenance log entry for durable changes.

### Skill Evolution Workflow

1. Identify repeated agent behavior that is currently fragile or verbose.
2. Decide whether it belongs in core skill instructions, a reference file, or a script.
3. Keep the core skill short.
4. Add deterministic scripts for checks that should not depend on model judgment.
5. Validate on a small fixture wiki.
6. Record lessons in the skill, not only in chat history.

## Quality Gates

Every substantial wiki operation should pass these gates unless the user explicitly accepts a documented exception:

- raw sources were not modified;
- generated pages have valid frontmatter;
- internal links resolve;
- source pages are indexed;
- topic pages cite source pages;
- duplicate pages were avoided or documented;
- log entries are append-only and parseable;
- generated content follows local naming and language rules;
- status values reflect uncertainty, conflicts, and stale material;
- commits exclude local editor state, caches, and scratch files.

## Skill Package Layout

A future Codex skill bundle could use:

```text
llm-wiki/
  SKILL.md
  agents/
    openai.yaml
  references/
    repository-contract.md
    page-templates.md
    workflows.md
    quality-gates.md
  scripts/
    wiki_health.py
    wiki_link_check.py
    wiki_index_check.py
    wiki_log_check.py
    wiki_slug.py
```

`SKILL.md` should contain only the trigger conditions, short workflow map, and guidance on which reference or script to use. Detailed conventions should move into `references/`. Mechanical validation belongs in `scripts/`.

## Acceptance Criteria for the Future Skillset

The skillset is ready for broad use when it can do the following on a fresh markdown repository:

- initialize a valid wiki structure;
- ingest a small source set into source pages and topic pages;
- update overlapping topic pages without duplicate nodes;
- answer a question using indexed wiki pages and citations;
- file a durable answer into `wiki/questions/`;
- detect broken links and missing index entries;
- generate a health report;
- preserve raw sources;
- leave a clean, reviewable git diff.

## Explicit Defaults

- Default link style: Obsidian wiki links.
- Default filename style: lowercase kebab-case.
- Default source unit: one source file, unless a project defines sections or chapters.
- Default control files: `wiki/index.md`, `wiki/log.md`, `wiki/overview.md`.
- Default health gate: zero broken internal links.
- Default commit policy: commit after major ingests or maintenance passes only when the user or project policy asks for commits.
- Default uncertainty policy: mark weak, conflicting, or stale material instead of silently merging it.
- Default skill design: concise core skill, optional references, deterministic scripts for validation.

## Future Extensions

- Add a local search backend for large wikis.
- Add graph analysis for hubs, orphans, and isolated clusters.
- Add importers for browser-clipped pages, PDFs, transcripts, chat exports, and structured data.
- Add project-specific domain packs that extend page types, safety rules, source ranking, and terminology.
- Add review workflows where a second agent audits source grounding and duplicate-node decisions.
- Add dashboard generation for health trends across commits.
- Add migration tools for renaming pages while preserving links.

## Non-Goals

- Do not make the core skillset depend on any specific subject matter.
- Do not require vector search for small wikis.
- Do not let generated summaries replace raw sources.
- Do not hide conflicts or uncertainty for the sake of a cleaner page.
- Do not make a rigid taxonomy mandatory when a project needs a different graph shape.


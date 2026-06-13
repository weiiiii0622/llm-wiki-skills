# llm-wiki-skills

Install local skills that teach Codex or Claude Code how to maintain a source-grounded markdown wiki inside your project.

If your AI assistant keeps losing context between sessions, this gives it a durable place to put what it learns: original notes in `raw/`, cleaned-up knowledge in `wiki/`, and repeatable workflows for ingesting, querying, and checking that knowledge.

## What It Is For

Use `llm-wiki-skills` when you want an AI coding agent to build and maintain a local knowledge base for a repo, research project, product spec, meeting notes folder, or any markdown-heavy workspace.

It is useful when you want to:

- turn scattered notes and source material into durable wiki pages;
- ask questions against local project knowledge without starting from scratch;
- keep raw evidence separate from summarized knowledge;
- give Codex and Claude Code the same wiki workflow;
- keep everything local, file-based, and easy to inspect.

The CLI does not call an LLM, run a hosted service, or create a vector database. It installs the local folder structure and agent skills. Your AI assistant uses those skills when you ask it to ingest sources, answer from the wiki, or review wiki changes.

## Quickstart

Install skills for Codex:

```sh
npx llm-wiki-skills init --host codex
```

Install skills for Claude Code:

```sh
npx llm-wiki-skills init --host claude-code
```

Install both:

```sh
npx llm-wiki-skills init --host codex,claude-code
```

Start with a topic scaffold:

```sh
npx llm-wiki-skills init --host codex --topic product-builder
```

Check that the local install is complete:

```sh
npx llm-wiki-skills status
```

## How You Use It

After `init`, ask your agent to use one of the installed skills.

Ingest source material:

```text
Use the llm-wiki-ingest skill. Ingest raw/sources/customer-notes.md into the wiki and update any overlapping pages.
```

Ask a question from the wiki:

```text
Use the llm-wiki-query skill. What do we know about onboarding friction? Cite the wiki pages you used.
```

Health-check the wiki:

```text
Use the llm-wiki-lint skill. Find stale claims, contradictions, orphan pages, missing cross-references, and gaps worth investigating.
```

## What Gets Installed

`init` creates a local wiki workspace and host-specific skills:

```text
raw/                         preserved source material
wiki/                        durable markdown knowledge
docs/llm-wiki-contract.md    local wiki rules
docs/llm-wiki-workflows.md   ingest/query/lint workflow reference
.llm-wiki-skills.json        install manifest for status checks
```

For Codex, it writes repo-scoped skills under `.agents/skills/`. For Claude Code, it writes project skills under `.claude/skills/`. Existing files are skipped on rerun so local edits are not overwritten.

## Topic Directory Scaffolds

`init` can add category directories for a specific kind of wiki. Use `--topic <id>` or the equivalent `--template <id>`. Topic directories and the routing guide are optional scaffolds: rerunning `init --topic <id>` recreates missing scaffold outputs, but `status` does not fail if you delete or replace them.

Every built-in topic creates:

- category directories under `wiki/`
- `docs/llm-wiki-routing.md`, which tells generated agent skills how to route ingested notes

Available topic options:

### `general`

Use this for mixed notes, broad research, and a neutral starting point.

Creates these directories:

```text
wiki/
|-- projects/
|-- areas/
|-- resources/
|-- archives/
|-- sources/
|-- questions/
`-- templates/
```

- examples: reading notes, personal research, small reusable answers

### `study-research`

Use this for papers, courses, research notes, claims, and unanswered questions.

Creates these directories:

```text
wiki/
|-- literature/
|-- notes/
|-- concepts/
|-- methods/
|-- datasets/
|-- questions/
|-- sources/
`-- outputs/
```

- examples: paper reviews, course notes, research questions

### `work-project`

Use this for project context, decisions, stakeholders, risks, and delivery notes.

Creates these directories:

```text
wiki/
|-- projects/
|-- decisions/
|-- meetings/
|-- stakeholders/
|-- risks/
|-- requirements/
`-- sources/
```

- examples: decision logs, meeting notes, project references

### `product-builder`

Use this for customer evidence, product bets, market notes, and build decisions.

Creates these directories:

```text
wiki/
|-- users/
|-- feedback/
|-- problems/
|-- solutions/
|-- experiments/
|-- competitors/
|-- decisions/
|-- metrics/
`-- sources/
```

- examples: customer interviews, experiment notes, competitor research

### `writing-content`

Use this for source material, draft ideas, editorial notes, and reusable phrasing.

Creates these directories:

```text
wiki/
|-- ideas/
|-- research/
|-- claims/
|-- outlines/
|-- drafts/
|-- revisions/
|-- references/
`-- published/
```

- examples: essay outlines, draft research, published pieces

### `trip-plan`

Use this for destination research, itineraries, bookings, travel constraints, and day plans.

Creates these directories:

```text
wiki/
|-- itinerary/
|-- places/
|-- transport/
|-- lodging/
|-- bookings/
|-- budget/
|-- packing/
`-- sources/
```

- examples: itineraries, booking references, destination notes

### `finance`

Use this for budgets, tax references, investment research, assumptions, and review items. It keeps financial notes source-grounded and does not replace professional advice.

Creates these directories:

```text
wiki/
|-- accounts/
|-- budget/
|-- cashflow/
|-- debts/
|-- investments/
|-- insurance/
|-- taxes/
|-- goals/
|-- policies/
|-- questions/
`-- sources/
```

- examples: budget notes, tax references, investment research

### `home-life`

Use this for household systems, family operations, recurring routines, records, and home projects.

Creates these directories:

```text
wiki/
|-- household/
|-- maintenance/
|-- vendors/
|-- inventory/
|-- purchases/
|-- warranties/
|-- records/
|-- routines/
|-- emergency/
`-- sources/
```

- examples: home projects, important records, recurring routines

### `medical`

Use this for anatomy, physiology, conditions, diagnostics, drugs, procedures, guidelines, cases, and questions for professional review.

Creates these directories:

```text
wiki/
|-- anatomy/
|-- physiology/
|-- conditions/
|-- diagnostics/
|-- drugs/
|-- procedures/
|-- guidelines/
|-- cases/
|-- questions/
|-- sources/
`-- templates/
```

- examples: clinical references, drug notes, diagnostic criteria

### `legal-admin`

Use this for administrative records, legal references, contracts, deadlines, and unresolved questions. It keeps legal notes organized and does not replace legal advice.

Creates these directories:

```text
wiki/
|-- matters/
|-- documents/
|-- contracts/
|-- parties/
|-- evidence/
|-- deadlines/
|-- correspondence/
|-- filings/
|-- questions/
`-- sources/
```

- examples: contracts, evidence files, deadline checklists

### `custom`

Use this when none of the built-in topics match your vault.

```sh
npx llm-wiki-skills init --host codex --topic custom --custom-topic "board game design"
```

`custom` uses the `general` scaffold, creates `docs/llm-wiki-routing.md`, records custom topic metadata, and prints a handoff prompt you can give to your own LLM. The CLI does not call a hosted LLM or import generated structure files.

## Commands

```sh
llm-wiki-skills init [--root DIR] [--host codex|claude-code] [--topic ID] [--json] [--quiet]
llm-wiki-skills status [--root DIR] [--json] [--quiet]
```

`init` installs the local wiki contract, starter pages, optional topic scaffold, shared references, selected host skills, and a manifest.

`--template ID` is an alias for `--topic ID`. If both are provided, they must match.

`status` verifies the manifest and required files still match the selected hosts.

If `--host` is omitted in an interactive terminal, `init` opens a guided setup: choose host targets, choose a topic, review the files that will be created or refreshed, then confirm before anything is written. In scripts, CI, `--json`, or `--quiet` usage, pass `--host`.

## Requirements

- Node.js 20 or newer.
- Codex or Claude Code if you want an agent to use the generated skills.
- A project directory or markdown vault where local files can be created.

## What This Is Not

`llm-wiki-skills` is not a note-taking app, search backend, hosted memory service, or automatic importer. It is a small local installer for repeatable AI-agent wiki workflows.

## Development

```sh
npm install
npm test
npm run smoke
```

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

For Codex, it writes skills under `.codex/skills/`. For Claude Code, it writes skills under `.claude/skills/`. Existing files are skipped on rerun so local edits are not overwritten.

## Commands

```sh
llm-wiki-skills init [--root DIR] [--host codex|claude-code] [--json] [--quiet]
llm-wiki-skills status [--root DIR] [--json] [--quiet]
```

`init` installs the local wiki contract, starter pages, shared references, selected host skills, and a manifest.

`status` verifies the manifest and required files still match the selected hosts.

If `--host` is omitted in a terminal, `init` opens a host selector. In scripts and CI, pass `--host`.

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

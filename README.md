# llm-wiki-skills

Graph-first CLI and skill package for maintaining persistent, Obsidian-compatible LLM wiki vaults.

## Quickstart

```sh
npx llm-wiki-skills init
```

The first run creates the default vault contract:

```text
raw/
wiki/
  graph.json
  graph.md
docs/
tools/
AGENTS.md
CLAUDE.md
.codex/skills/llm-wiki/SKILL.md
.claude/skills/llm-wiki/SKILL.md
```

## Installation

You can run the package without installing it globally:

```sh
npx llm-wiki-skills init
```

To install the CLI globally:

```sh
npm install -g llm-wiki-skills
llm-wiki-skills init
```

To install it in a project and run it through npm:

```sh
npm install --save-dev llm-wiki-skills
npx llm-wiki-skills init --root .
```

Requirements:

- Node.js 20 or newer.
- A markdown vault or project directory where the command can create `raw/`, `wiki/`, `docs/`, and agent skill files.

## Commands

```sh
llm-wiki-skills init
llm-wiki-skills health
llm-wiki-skills lint
llm-wiki-skills graph
```

All commands support `--root DIR`, `--json`, `--quiet`, and `--debug`. `graph` also supports `--check`.

These are deterministic maintenance commands. They do not call an LLM and they do not perform semantic ingest or question answering by themselves.

## Agent Workflows

`init` installs Codex and Claude skill instructions into the target vault:

```text
.codex/skills/llm-wiki/SKILL.md
.claude/skills/llm-wiki/SKILL.md
```

Use those with an agent for the semantic workflows:

```text
wiki-ingest: add source material, create source pages, update overlapping topic pages, update index/log, regenerate graph, lint.
wiki-query: answer from wiki pages, cite sources, optionally file durable answers under wiki/questions/, regenerate graph, lint.
```

Example agent request after `npx llm-wiki-skills init`:

```text
Use the llm-wiki skill. Ingest raw/sources/interview-notes.md into the wiki, update any overlapping topic pages, then run graph and lint.
```

Example query request:

```text
Use the llm-wiki skill. Answer "What do we know about graph-first vault maintenance?" from this vault and cite the wiki pages you used.
```

## Example Usage

Create a new vault:

```sh
npx llm-wiki-skills init --root my-wiki
```

Example output:

```text
Initialized llm-wiki vault.
Created: 14
Skipped existing files: 0
Next: run `llm-wiki-skills health`.
```

Check the vault:

```sh
npx llm-wiki-skills health --root my-wiki --json
```

Example output, with the absolute path shortened:

```json
{
  "status": "pass",
  "root": "/path/to/my-wiki",
  "pageCount": 8,
  "countsByType": {
    "index": 1,
    "log": 1,
    "overview": 1,
    "template": 5
  },
  "countsByStatus": {
    "draft": 6,
    "reviewed": 2
  },
  "orphanPages": [],
  "issues": []
}
```

Regenerate graph sidecars after an agent edits wiki pages:

```sh
npx llm-wiki-skills graph --root my-wiki
```

Example output:

```text
Graph written.
Nodes: 0
Edges: 0
```

Then ask your coding agent to use the installed skill for semantic work:

```text
Use the llm-wiki skill. Ingest raw/sources/interview-notes.md into the wiki, update overlapping topic pages, then run graph and lint.
```

## Graph Sidecars

`wiki/graph.json` is the canonical machine-readable graph. `wiki/graph.md` is the generated human-readable report. Page markdown stays clean and uses ordinary Obsidian wikilinks.

Graph metadata:

```yaml
llmWikiGraphVersion: 1
createdBy: llm-wiki-skills@0.1.0
scoringRubricVersion: 1
```

## Development

```sh
npm install
npm test
npm run pack:dry-run
npm run smoke
```

Release checks run build, tests, `npm pack --dry-run`, and npm provenance publishing from GitHub Actions.

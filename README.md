# llm-wiki-skills

Local-first CLI for installing host-specific LLM wiki skills into a project or markdown vault.

## Quickstart

Install Codex skills into the current directory:

```sh
npx llm-wiki-skills init --host codex
```

Install Claude Code skills instead:

```sh
npx llm-wiki-skills init --host claude-code
```

Install both hosts:

```sh
npx llm-wiki-skills init --host codex,claude-code
```

Check the installed contract:

```sh
npx llm-wiki-skills status
```

## Commands

```sh
llm-wiki-skills init [--root DIR] [--host codex|claude-code] [--json] [--quiet]
llm-wiki-skills status [--root DIR] [--json] [--quiet]
```

`init` creates local wiki starter files, shared workflow references, host-specific skills, and a `.llm-wiki-skills.json` manifest. If `--host` is omitted in a terminal, the CLI opens a small selector. In non-TTY environments, pass `--host`.

`status` reads `.llm-wiki-skills.json` and verifies that the required files for the selected hosts still exist.

## Generated Files

```text
.llm-wiki-skills.json
docs/
  llm-wiki-contract.md
  llm-wiki-workflows.md
.codex/skills/llm-wiki-ingest/SKILL.md
.codex/skills/llm-wiki-query/SKILL.md
.codex/skills/llm-wiki-lint/SKILL.md
.claude/skills/llm-wiki-ingest/SKILL.md
.claude/skills/llm-wiki-query/SKILL.md
.claude/skills/llm-wiki-lint/SKILL.md
```

Only selected host files are generated. Existing user-edited files are skipped on rerun.

## Agent Workflows

The generated host skills cover three local workflows:

- `llm-wiki-ingest`: add source material and update durable wiki pages.
- `llm-wiki-query`: answer questions from the local wiki with page citations.
- `llm-wiki-lint`: review local wiki edits before handoff.

Example request after init:

```text
Use the llm-wiki-ingest skill. Ingest raw/sources/interview-notes.md into the wiki and update overlapping pages.
```

## Development

```sh
npm install
npm test
npm run pack:dry-run
npm run smoke
```

TODO: design global install behavior separately. The current package intentionally installs skills into a local project or vault.

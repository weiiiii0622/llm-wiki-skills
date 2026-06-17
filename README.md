<p align="center">
  <img src="https://raw.githubusercontent.com/weiiiii0622/llm-wiki-skills/main/media/icon.png" alt="llm-wiki-skills icon" width="144">
</p>

<h1 align="center">llm-wiki-skills</h1>

<p align="center">
  Local-first wiki skills for Codex and Claude Code.
  <br>
  Turn scattered project notes into a durable, source-grounded knowledge vault your agent can maintain.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/llm-wiki-skills"><img src="https://img.shields.io/npm/v/llm-wiki-skills?color=111827" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/llm-wiki-skills"><img src="https://img.shields.io/npm/dm/llm-wiki-skills?color=2563eb" alt="npm downloads"></a>
  <a href="https://github.com/weiiiii0622/llm-wiki-skills/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/llm-wiki-skills?color=0f766e" alt="license"></a>
</p>

```sh
npx llm-wiki-skills init
```

## Why This Exists

AI agents are useful until they forget the context you gave them last week. `llm-wiki-skills` gives them a local place to preserve what they learn:

| Before | After |
| --- | --- |
| Notes, PDFs, meeting docs, and decisions live in scattered files. | Sources stay in `raw/`, durable knowledge lands in `wiki/`, and agents know how to update it. |
| Every session starts with "read these files again." | Codex or Claude Code can ingest, query, and lint the same local vault. |
| Search depends on whatever the model happens to load. | Markdown stays canonical, with optional local qmd search acceleration. |

## What Makes It Different

- **Agent-native:** installs skills for Codex and Claude Code, not just docs for humans.
- **Local-first:** no hosted memory service, no remote database, no required account.
- **Source-grounded:** raw evidence and synthesized wiki pages stay separate.
- **Topic-aware:** choose a scaffold for research, product work, trips, investing, medical notes, legal/admin records, and more.
- **Obsidian-ready:** generated vault metadata works with Obsidian's native graph view.
- **Search-upgradable:** optional `qmd` support adds local SQLite-backed hybrid search while markdown remains the source of truth.

## Getting Started

Run the setup wizard in any repo or markdown workspace:

```sh
npx llm-wiki-skills init
```

The wizard asks which agent host to install, which topic scaffold to use, and whether to prepare the folder as an Obsidian vault.

For a non-interactive Codex setup:

```sh
npx llm-wiki-skills init --host codex --topic work-project --quiet
```

Then check the install:

```sh
npx llm-wiki-skills status
```

<p align="center">
  <img src="https://raw.githubusercontent.com/weiiiii0622/llm-wiki-skills/main/media/llm-wiki-skills-installation.gif" alt="Installing llm-wiki-skills and creating a local wiki vault" width="760">
</p>

## Installation

Use it directly with `npx`:

```sh
npx llm-wiki-skills init
```

Or install it globally:

```sh
npm install -g llm-wiki-skills
llm-wiki-skills init
```

Requirements:

- Node.js 22 or newer.
- Codex or Claude Code if you want an agent to use the generated skills.
- A project folder or markdown vault where local files can be created.

#### Non-interactive installation supported

```sh
npx llm-wiki-skills init --host codex --topic product-builder
```

Common flags:

| Flag | Use it when |
| --- | --- |
| `--host codex` | Install Codex repo skills under `.agents/skills/`. |
| `--host claude-code` | Install Claude Code project skills under `.claude/skills/`. |
| `--topic work-project` | Add topic directories and routing guidance. |
| `--obsidian` / `--no-obsidian` | Enable or skip Obsidian vault metadata. |
| `--qmd` | Add optional local qmd search support. |
| `--json` / `--quiet` | Use in scripts or CI. |

## Usage

### Ask Your Agent to Use the Wiki

After setup, use the installed skills in your agent:

```text
Use the llm-wiki-ingest skill. Ingest raw/sources/customer-notes.md
into the wiki and update any overlapping pages.
```

```text
Use the llm-wiki-query skill. What do we know about onboarding friction?
Cite the wiki pages you used.
```

```text
Use the llm-wiki-lint skill. Find stale claims, contradictions,
or missing cross-references before handoff.
```

### Plan Larger Ingests

For bigger raw folders, create a batch plan first:

```sh
npx llm-wiki-skills ingest plan --raw raw/sources
npx llm-wiki-skills ingest status --plan PLAN_ID
npx llm-wiki-skills ingest validate --plan PLAN_ID
```

The ingest commands help track source files before your agent synthesizes them into wiki pages.

It is suggested to have AI Agents to handle this workflow, by having the agents to ingest the file, agents will auto-detect these tools and use them directly.

## Example Workflow

```text
1. Drop source material into raw/sources/
2. Ask the agent to use llm-wiki-ingest
3. The agent handle ingest workflow automatically
4. The agent writes source summaries and durable wiki pages
5. Ask questions with llm-wiki-query
6. Run llm-wiki-lint before important handoffs
```

A small demo vault is included at [`fixtures/demo-vault`](fixtures/demo-vault). Use it to inspect the expected shape before initializing your own workspace.

## Topic Vault Structure

Every vault starts with the same simple contract:

```text
raw/                         preserved source material
wiki/                        durable markdown knowledge
docs/llm-wiki-contract.md    local wiki rules
docs/llm-wiki-workflows.md   ingest/query/lint workflow reference
.obsidian/                   optional Obsidian vault settings
.llm-wiki-skills.json        install manifest for status checks
```

Topic scaffolds add useful `wiki/` categories and a routing guide at `docs/llm-wiki-routing.md`.

| Topic | Best for | Example categories |
| --- | --- | --- |
| `general` | Mixed notes and broad research | projects, areas, resources, questions |
| `study-research` | Papers, courses, experiments | concepts, papers, methods, datasets |
| `work-project` | Delivery context and team knowledge | architecture, decisions, meetings, risks |
| `product-builder` | Customer evidence and product bets | personas, problems, competitors, metrics |
| `writing-content` | Essays, drafts, editorial research | audience, topics, claims, outlines |
| `trip-plan` | Travel planning and bookings | destinations, hotels, transport, itinerary |
| `investment` | Research, theses, watchlists | companies, valuation, catalysts, postmortems |
| `home-life` | Household systems and records | maintenance, purchases, utilities, documents |
| `medical` | Clinical study notes and references | conditions, diagnostics, drugs, guidelines |
| `legal-admin` | Contracts, deadlines, admin records | matters, obligations, agencies, contacts |
| `custom` | Anything else | starts from `general` plus your custom label |

Example:

```sh
npx llm-wiki-skills init --host codex --topic study-research
```

Creates a research-friendly vault like:

```text
wiki/
|-- concepts/
|-- papers/
|-- methods/
|-- datasets/
|-- claims-and-evidence/
`-- templates/
```

## qmd Search Support

qmd is optional and off by default. Enable it when your wiki is large enough that local hybrid search is useful:

```sh
npx llm-wiki-skills init --host codex --qmd
npx llm-wiki-skills qmd status
npx llm-wiki-skills qmd reindex
```

Markdown under `wiki/` remains canonical. qmd is only used for local candidate discovery.

## What This Is / Is Not

| This is | This is not |
| --- | --- |
| A local installer for agent wiki workflows. | A hosted memory service. |
| A way to keep raw evidence and durable knowledge organized. | A replacement for reviewing source material. |
| A bridge between markdown vaults, Codex, Claude Code, and Obsidian. | A full note-taking app or automatic importer. |
| Optional local search acceleration through qmd. | A required cloud search backend. |

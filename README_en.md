<div align="right">

English · [简体中文](README.md)

</div>

<div align="center">

# career-wiki-skill

**Interview with an AI agent to build a structured Wiki knowledge base, then generate multiple resumes from it.**

Cross-agent compatible · Local Markdown data · Supports Claude Code / Codex / Hermes / OpenClaw and other agents that support the Skill format

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-Compatible-blueviolet)](https://skills.sh)
[![Runtime Neutral](https://img.shields.io/badge/Runtime-Neutral-green)](#runtime-compatibility)
[![OKF](https://img.shields.io/badge/OKF-v0.2-blue)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)

</div>

---

## What problem does it solve?

Job seekers usually face three problems when preparing resumes:

1. **Scattered information** — Work history, projects, skills, and education live in memory, old resumes, and disconnected documents.
2. **Repeated resume editing** — Each application needs a different emphasis, so the same resume is edited manually again and again.
3. **No accumulated knowledge** — Interview notes and reflections are not preserved, so every preparation starts from scratch.

career-wiki-skill solves these as one workflow: **interview → Wiki knowledge base → multiple resumes → visual editing and export**.

---

## The core loop

```
Interview ──→ raw Markdown ──→ Wiki compile ──→ Structured knowledge base
                                                   │
                                         ┌─────────┴─────────┐
                                         ↓                   ↓
                                   Resume generation     Web editor
                                   (templates+config)    (drag+preview+export)
```

### Main capabilities

- **Deep, sequential interviews** — Project interviews ask one question at a time and follow up until the current answer is clear.
- **Complete project knowledge archival** — Project descriptions, responsibilities, tech stacks, challenges, solutions, outcomes, and learnings are stored separately; original answers stay in raw sources while structured fields enter the Wiki.
- **Multiple resume views** — Generate multiple role-specific resumes from one Wiki and hide irrelevant projects or fields without changing the source knowledge base.
- **Visual editing and live preview** — A minimal editor supports module ordering, field overrides, item visibility, template switching, and A4 preview.
- **Direct PDF download** — Generate and download the rendered PDF directly from the preview, with HTML and JSON exports; the knowledge directory is already a portable OKF bundle.
- **Readable Wiki graph** — Browse entity nodes, relationships, legends, and details to understand connections between projects and skills.

---

## Six skills

| # | Skill | Form | Responsibility |
|---|-------|------|----------------|
| 1 | **env-init** | SKILL.md + Python script | Environment checks, data directory initialization, dependency setup |
| 2 | **interview** | SKILL.md only | Sequential interviews, project context discovery, raw Markdown output |
| 3 | **file-parser** | SKILL.md only | Extract content from PDFs/images/documents into raw sources |
| 4 | **wiki-engine** | SKILL.md + Node scripts | Strict OKF v0.2 compile/lint and one-time legacy migration |
| 5 | **resume-generator** | SKILL.md + Node API server | Query Wiki data and assemble resume JSON from templates |
| 6 | **web-editor** | SKILL.md + React app | Visual editing, multiple resumes, template management, privacy masking, live preview, Wiki graph, and PDF export |

---

## Data model

### 10 entity types

```
person · experience · project · skill · education ·
certificate · award · publication · activity · summary
```

### 13 relationship types

```
has_experience · has_skill · has_education · has_certificate ·
has_award · has_publication · has_activity · has_summary ·
used_skill · did_project · at_company · took_course · references
```

### Project fields

Project entities keep resume-facing fields separate from deeper knowledge-archival fields:

| Field | Purpose | Included by default in resumes |
|-------|---------|-------------------------------|
| `description` | Project background, goals, and main functions | Yes |
| `responsibilities` | Your specific responsibilities | Yes |
| `tech_stack` | Technologies used in the project | Yes |
| `challenges` | Challenges, constraints, and risks | No |
| `solutions` | Analysis, solutions, and decision rationale | No |
| `outcomes` | Quantitative results, feedback, or business impact | No |
| `learnings` | Retrospective insights and improvement directions | No |

Fields not shown by default are still fully stored in the Wiki and can be selected for targeted resumes.

### Storage

Pure local Markdown + YAML frontmatter, Git-friendly, with no database dependency.

```
~/.career_wiki/
├── knowledge/             ← Portable OKF v0.2 bundle
│   ├── index.md
│   ├── references/
│   │   ├── raw/           ← Interview and extracted Reference concepts
│   │   └── uploads/       ← Original uploaded files
│   ├── persons/
│   ├── experiences/
│   ├── projects/
│   ├── skills/
│   └── ...
└── .career-wiki-skill/    ← App state, outside the OKF bundle
    ├── resumes/
    ├── templates/
    └── backups/
```

`knowledge/` is itself the strict OKF v0.2 bundle, not a private Wiki awaiting export. Concepts use `type`, object-array `sources`, `generated/verified`, and standard Markdown links; application state is physically separated.

---

## Quick start

### 1. Install

Tell your agent:

```
Install this skill: https://github.com/eachuwang/career-wiki-skill
```

The agent can clone the repository into its skill directory.

Manual installation:

```bash
git clone https://github.com/eachuwang/career-wiki-skill.git
```

Copy the directories under `skills/` into your agent's skill directory, such as `~/.claude/skills/`.

### 2. Initialize the environment (required after installation)

Installing the files alone does not create the data directory or install dependencies. Initialize first:

Tell your agent:

```
Check the career-wiki environment / Initialize the career-wiki environment
```

The `env-init` skill will:

1. Check Node.js ≥ 18, Python ≥ 3.9, and npm.
2. Create the `~/.career_wiki/` directory structure.
3. Install Node dependencies such as `gray-matter`.
4. Write the runtime configuration.

**Interviewing, Wiki compilation, and resume generation are available after initialization.**

### 3. Start an interview

```
Start an interview / Help me record my experience
```

The `interview` skill starts a multi-turn conversation. For projects, it asks one question at a time about the description, responsibilities, tech stack, challenges, solutions, outcomes, and learnings. Unclear answers are followed up before moving on.

### 4. View and edit resumes

```
Open the editor / Show my resume preview
```

The `web-editor` skill starts the React frontend with module ordering, field editing, project visibility, live preview, and PDF/HTML/JSON export. PDFs are generated directly from the current A4 preview without opening a printer dialog.

---

## Design principles

| # | Principle | Description |
|:---|:---|:---|
| 01 | **Skills orchestrate; they do not execute** | SKILL.md guides the agent, LLM reasoning performs the work, and scripts handle deterministic operations. |
| 02 | **Cross-agent compatibility** | Uses common tools such as Bash, Python, and Node instead of agent-specific APIs. |
| 03 | **Local-first data** | User data lives in `~/.career_wiki/`, with user-controlled synchronization such as Git or a local drive. |
| 04 | **Knowledge as a build artifact** | Rebuild from Reference concepts; do not edit generated pages manually. |
| 05 | **Native OKF storage** | `knowledge/` directly follows OKF v0.2, with no private compatibility format. |

---

## Runtime compatibility

career-wiki-skill works with the following agent tools:

- **Claude Code** — Anthropic's CLI coding tool
- **Codex** — OpenAI's coding CLI
- **Hermes Agent** — Nous Research's open-source agent framework
- **OpenClaw** — Open-source agent ecosystem
- **Cursor** — AI code editor
- **Gemini CLI** — Google's agent CLI
- And any other agent that supports the `SKILL.md` format

All SKILL.md files have passed the runtime compatibility scan with no single-agent-specific wording.

---

## Technology stack

| Component | Technology |
|-----------|------------|
| Wiki data | OKF v0.2 Markdown + YAML frontmatter + standard Markdown links |
| API server | Node.js + gray-matter (plain `node:http`, no framework) |
| Web frontend | React 18 + Vite + dnd-kit + Tailwind CSS + vis-network + html2pdf.js |
| Python scripts | Environment checks using the standard library |
| Export formats | PDF (directly from A4 preview) / HTML / JSON; the knowledge layer is native OKF |
| Template system | JSON configuration + CSS styles |

---

## Inspirations

- **OKF (Open Knowledge Format)** — Google's knowledge format standard: local Markdown + frontmatter without a centralized schema.
- **LLM Wiki** — Karpathy's idea of compiling knowledge into an interconnected Wiki instead of retrieving from scratch every time.
- **SkillLens + SkillOpt** — Microsoft's skill evaluation and optimization frameworks.

---

## License

MIT. See [LICENSE](LICENSE).

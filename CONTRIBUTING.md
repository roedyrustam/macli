# Contributing to Macli

Thank you for considering contributing to **Macli** (`@roedyrustam/macli`)! Contributions of bug fixes, new integrations, documentation improvements, and custom skills are very welcome.

## Prerequisites

- **Node.js** `>= 18.0.0` (tested on Node 18, 20, and 22)
- **npm** `>= 9.0.0`
- A valid `GOOGLE_API_KEY` (optional for build/typecheck, required for live LLM runs)

## Local Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/roedyrustam/macli.git
cd macli

# 2. Install dependencies cleanly
npm ci

# 3. Build TypeScript sources to dist/
npm run build

# 4. Run typecheck and CLI verification
npm test
```

## Project Structure

```text
macli/
├── src/
│   ├── index.ts                # CLI entrypoint (Commander.js commands: init, run)
│   ├── core/
│   │   ├── swarmDirector.ts    # LangGraph Supervisor + CoderAgent & ResearcherAgent
│   │   ├── skillLoader.ts      # Antigravity SKILL.md & Claude MCP config loader
│   │   ├── mcpClient.ts        # Stdio MCP client manager (@modelcontextprotocol/sdk)
│   │   └── tools/
│   │       └── osTools.ts      # Native OS tools (bash_executor, file_reader, file_writer)
│   └── types/
│       └── index.ts            # Shared TypeScript interfaces
├── examples/                   # Example Antigravity skills
├── skills/                     # Built-in project skills
├── BLUEPRINT.md                # Architecture deep-dive
└── package.json
```

## Creating a Custom Antigravity `SKILL.md`

Place skills inside a directory as `<skill-folder>/SKILL.md` with YAML frontmatter:

```markdown
---
name: my-custom-skill
description: Short description of what this skill enables the agent to do.
---

# My Custom Skill

Detailed instructions for the agent when invoking this skill.
```

Test loading your skill locally:

```bash
node dist/index.js run "Test my custom skill" --dir ./examples --debug
```

## Pull Request Guidelines

1. Create a feature or fix branch from `main` (e.g., `feat/add-retry-logic` or `fix/mcp-timeout`).
2. Keep changes focused and well-typed (`tsc --noEmit` must pass cleanly in TypeScript `strict` mode).
3. Do not commit `dist/`, `node_modules/`, or `.env` files.
4. Update `README.md` or `BLUEPRINT.md` if CLI flags or architecture behavior change.
5. Run `npm run build && npm test` before opening a Pull Request.

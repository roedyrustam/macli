# Changelog

All notable changes to `@roedyrustam/macli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-11-15

### Added
- Deep native integration with `vibes-plug` v4.8.0 via `src/core/vibesBridge.ts` (`178` skills, `1,199` code blueprints, `<350`-token micro-slices, and shared Blackboard state).
- Support for `9` specialist subagents (`swarm-architect`, `fullstack-craftsman`, `quality-guardian`, `data-rag-architect`, `fintech-payment-sentinel`, `cloud-devops-sre`, `ai-mcp-engineer`, `mobile-spatial-craftsman`, `reverse-security-auditor`).
- `3` swarm execution topologies (`fan_out_fan_in`, `pipeline_saga`, `critic_validator`) and Adaptive Model Cascade across Gemini and Anthropic profiles (`speed`, `balanced`, `deep`, `exhaustive`), plus `--deterministic` offline execution.
- New CLI commands: `macli skill exec`, `macli skill chain`, `macli skill slice`, `macli skill guard`, `macli agents`, `macli repo topics`, and `macli doctor`, along with `--json`, `--topology`, `--reasoning`, `--deterministic`, and `--with-vibes-mcp` flags.
- Automated GitHub repository topics generation and synchronization engine (`scripts/auto-topics.mjs`, `npm run repo:topics`, `macli repo topics`, and `.github/workflows/auto-topics.yml`).
- `366` deterministic AST/Regex guard rules automatically applied on `file_writer` writes and `macli skill guard`.
- Integration test suite in `src/test/macli.test.ts` executed via `npm test`.
- Open-source community health and repository standards (`LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub Issue/PR templates, Dependabot configuration, and `BLUEPRINT.md` v2.0.0).

### Changed
- Upgraded `skillLoader.ts` to parse YAML frontmatter (`name`, `description`, `version`, `author`), `Orchestration & Integration` graph edges, and `vibes-plug/mcp.json` `${PLUGIN_ROOT}` placeholders while skipping non-source directories (`node_modules`, `.git`, `dist`, `build`, `.next`).
- Hardened `McpClientManager` (`src/core/mcpClient.ts`) with per-server `cwd`, `stderr` handling, and connection timeouts.
- Updated `.github/workflows/build.yml` with read-only permissions, TypeScript typecheck (`npm run typecheck`), and CLI smoke verification.

### Fixed
- Moved `commander` from `devDependencies` to `dependencies` in `package.json` so global installation (`npm install -g @roedyrustam/macli`) resolves CLI runtime dependencies cleanly.
- Removed tracked `dist/` build artifacts from git index while keeping `dist/` and `.agents/` ignored in `.gitignore`.

## [1.0.0] - 2026-11-14

### Added
- Initial release of `@roedyrustam/macli`, an AI Agent Swarm Orchestrator CLI.
- LangGraph Supervisor network (`SwarmDirector`) delegating between `CoderAgent` and `ResearcherAgent`.
- Native OS tools (`bash_executor`, `file_reader`, `file_writer`).
- Antigravity `SKILL.md` loader (local project skills and global `~/.gemini/config` skills).
- Claude Desktop `claude_desktop_config.json` MCP client integration over `stdio`.
- Interactive `macli init` wizard and `macli run <task>` command.
- GitHub Actions CI matrix across Node.js `18.x`, `20.x`, and `22.x`.

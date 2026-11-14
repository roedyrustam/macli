# BLUEPRINT.md — Macli v2.0.0 Architecture

## Core Architecture

`macli` v2.0.0 integrates LangGraph multi-agent orchestration directly with the `vibes-plug` v4.8.0 runtime (`VIBES_PLUG_ROOT` or `~/.gemini/config/plugins/vibes-plug`):

1. **Vibes-Plug ESM Bridge (`src/core/vibesBridge.ts`)**
   Dynamically imports `vibes-plug` ESM modules (`skill-dispatcher.mjs`, `skill-rules-engine.mjs`, `swarm-runner.mjs`, `swarm-dispatcher.mjs`, `swarm-bus.mjs`) via `pathToFileURL`, caches `.skill-slices.json` (`178` skills, `1,199` code blueprints), loads all `9` specialist definitions from `agents/*.md`, and exposes typed wrappers for SaaT actions, composition chains, guard evaluations, swarm planning, and shared Blackboard state (`.agents/memory/blackboard_state.json`).

2. **Skill & MCP Loader (`src/core/skillLoader.ts`, `src/core/mcpClient.ts`)**
   - `parseSkillMarkdown()` extracts YAML frontmatter (`name`, `description`, `version`, `author`) and `Orchestration & Integration` graph references.
   - Enriches local and global skills with `.skill-slices.json` metadata (`domain`, `supportedActions`, `guardRulesCount`, `codeBlueprintsCount`, `nfrContract`).
   - `loadVibesMcpConfig()` expands `${PLUGIN_ROOT}` placeholders in `vibes-plug/mcp.json`, and `McpClientManager` enforces per-server working directory (`cwd`) and connection timeouts so unavailable optional servers degrade gracefully.

3. **Native OS & Vibes-Plug Tools (`src/core/tools/osTools.ts`, `src/core/tools/vibesTools.ts`)**
   - `osTools`: `bash_executor`, `file_reader`, and `file_writer` (which automatically executes `evaluateGuardRules()` after every write and reports guardrail violations immediately).
   - `vibesTools`: `vibes_skill_dispatch`, `vibes_skill_chain`, `vibes_guard_audit`, and `vibes_blackboard`.

4. **Swarm Director (`src/core/swarmDirector.ts`)**
   - **Adaptive Model Cascade**: Dynamically selects Gemini (`gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`) or Anthropic (`claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929`, `claude-opus-4-6`) based on the resolved `ReasoningProfile` (`speed`, `balanced`, `deep`, `exhaustive`) with automatic fallback on provider/model failure.
   - **9 Specialist Subagents with Context Pruning**: Injects compact `<350`-token micro-slices from `.skill-slices.json` into each specialist's system prompt.
   - **3 Topologies**: Executes `fan_out_fan_in` (parallel), `pipeline_saga` (sequential staged handoff), or `critic_validator` (implementers gated by `quality-guardian`).
   - **Deterministic Offline Mode**: When `--deterministic` is passed or no API key is configured, runs `dispatchHeadlessSwarm` + per-specialist `executeSkillAction` + `evaluateGuardRules` and persists findings to the Blackboard.

5. **CLI Entrypoint (`src/index.ts`)**
   Provides `init`, `run`, `skill exec|chain|slice|guard`, `agents`, and `doctor` commands with clean JSON mode (`--json`) and exit-code gating on failed guardrail audits.

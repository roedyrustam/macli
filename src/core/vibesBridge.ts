import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  GuardEvaluationResult,
  ReasoningProfile,
  ReasoningProfileId,
  SkillActionRequest,
  SkillActionResponse,
  SkillSlice,
  SubagentRoleId,
  SubagentSpec,
  SwarmExecutionPlan,
  SwarmTopology,
} from '../types';

const SUBAGENT_ADAPTER_MAP: Record<SubagentRoleId, string> = {
  'swarm-architect': 'skill-dispatcher.mjs',
  'fullstack-craftsman': 'frontend.mjs, api.mjs',
  'quality-guardian': 'tdd.mjs, security.mjs',
  'data-rag-architect': 'database.mjs',
  'fintech-payment-sentinel': 'security.mjs, database.mjs',
  'cloud-devops-sre': 'cloud-devops.mjs',
  'ai-mcp-engineer': 'ai-mcp.mjs, skill-dispatcher.mjs',
  'mobile-spatial-craftsman': 'mobile-spatial.mjs',
  'reverse-security-auditor': 'security.mjs, tdd.mjs',
};

const VALID_SUBAGENT_IDS = new Set<SubagentRoleId>(Object.keys(SUBAGENT_ADAPTER_MAP) as SubagentRoleId[]);

interface SkillDispatcherModule {
  SKILL_CHAIN_RECIPES: Record<string, { name: string; description: string; steps: Array<{ skill: string; action: string }> }>;
  dispatchSkillAction: (req: Record<string, unknown>) => Promise<SkillActionResponse>;
  dispatchSkillChain: (recipe: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getSkillCompactSlice: (skillName: string) => Promise<SkillSlice | null>;
}

interface SkillRulesEngineModule {
  SKILL_GUARD_RULES: Record<string, Array<{ id: string; severity: string; name: string; remediation: string }>>;
  evaluateContextualSkillGuards: (params: Record<string, unknown>) => Promise<GuardEvaluationResult>;
  matchSkillsForTarget: (context: Record<string, unknown>) => string[];
}

interface SwarmRunnerModule {
  TOPOLOGIES: Record<string, SwarmTopology>;
  REASONING_PROFILES: Record<string, ReasoningProfile>;
  resolveReasoningProfile: (taskDescription: string, requestedProfile?: string | null) => ReasoningProfile;
  planSwarm: (taskDescription: string, options?: Record<string, unknown>) => SwarmExecutionPlan;
  configureAutoSwarm: (options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface SwarmDispatcherModule {
  resolveNativeSubagent: (skillName?: string, domainName?: string) => SubagentRoleId;
  dispatchSwarm: (taskDescription: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface SwarmBusModule {
  swarmBus: {
    setBlackboard: (key: string, value: unknown, authorAgent?: string) => Record<string, unknown>;
    getBlackboard: (key: string) => Record<string, unknown> | null;
    listBlackboard: () => Array<Record<string, unknown>>;
    getEvents: (options?: Record<string, unknown>) => Array<Record<string, unknown>>;
  };
  emitSwarmEvent: (type: string, payload?: Record<string, unknown>) => Record<string, unknown>;
}

// Preserves native ESM dynamic import when TypeScript targets CommonJS under Node16 module resolution.
const runtimeEsmImport = new Function('specifier', 'return import(specifier)') as <T = unknown>(
  specifier: string
) => Promise<T>;

const moduleCache = new Map<string, Promise<unknown>>();
let slicesCache: Record<string, SkillSlice> | null = null;
let slicesCacheRoot: string | null = null;

/**
 * Resolves the root directory of the installed vibes-plug plugin.
 */
export function resolveVibesPluginRoot(): string {
  if (process.env.VIBES_PLUG_ROOT && process.env.VIBES_PLUG_ROOT.trim().length > 0) {
    return path.resolve(process.env.VIBES_PLUG_ROOT.trim());
  }
  return path.join(os.homedir(), '.gemini', 'config', 'plugins', 'vibes-plug');
}

/**
 * Checks whether the vibes-plug plugin directory and core scripts are present.
 */
export async function isVibesPluginInstalled(): Promise<boolean> {
  const root = resolveVibesPluginRoot();
  try {
    await access(path.join(root, 'scripts', 'skill-dispatcher.mjs'), constants.R_OK);
    return true;
  } catch (err: unknown) {
    void err;
    return false;
  }
}

async function importPluginModule<T>(relativeScriptPath: string): Promise<T> {
  const root = resolveVibesPluginRoot();
  const fullPath = path.join(root, relativeScriptPath);
  const cacheKey = fullPath;
  let pending = moduleCache.get(cacheKey);
  if (!pending) {
    const fileUrl = pathToFileURL(fullPath).href;
    pending = runtimeEsmImport<T>(fileUrl);
    moduleCache.set(cacheKey, pending);
  }
  return (await pending) as T;
}

/**
 * Loads and caches the pre-compiled `.skill-slices.json` map for O(1) slice lookups.
 */
export async function loadSkillSlicesMap(): Promise<Record<string, SkillSlice>> {
  const root = resolveVibesPluginRoot();
  if (slicesCache && slicesCacheRoot === root) {
    return slicesCache;
  }

  const slicesFile = path.join(root, '.skill-slices.json');
  try {
    const raw = await readFile(slicesFile, 'utf-8');
    const parsed = JSON.parse(raw) as { slices?: Record<string, SkillSlice> };
    if (parsed && parsed.slices && typeof parsed.slices === 'object') {
      slicesCache = parsed.slices;
      slicesCacheRoot = root;
      return slicesCache;
    }
  } catch (err: unknown) {
    void err;
  }
  return {};
}

/**
 * Reads `.skill-slices.json` top-level metadata (totalSkills, totalCodeBlueprints, version).
 */
export async function getSkillSlicesMetadata(): Promise<{
  version: string;
  totalSkills: number;
  totalCodeBlueprints: number;
}> {
  const root = resolveVibesPluginRoot();
  const slicesFile = path.join(root, '.skill-slices.json');
  try {
    const raw = await readFile(slicesFile, 'utf-8');
    const parsed = JSON.parse(raw) as {
      version?: string;
      totalSkills?: number;
      totalCodeBlueprints?: number;
      slices?: Record<string, SkillSlice>;
    };
    return {
      version: parsed.version || '4.8.0',
      totalSkills: parsed.totalSkills || Object.keys(parsed.slices || {}).length,
      totalCodeBlueprints: parsed.totalCodeBlueprints || 0,
    };
  } catch (err: unknown) {
    void err;
    return { version: 'unknown', totalSkills: 0, totalCodeBlueprints: 0 };
  }
}

/**
 * Loads the 9 native specialist subagent definitions from `vibes-plug/agents/*.md`.
 */
export async function loadNativeSubagentSpecs(): Promise<SubagentSpec[]> {
  const root = resolveVibesPluginRoot();
  const agentsDir = path.join(root, 'agents');
  const specs: SubagentSpec[] = [];

  try {
    const files = (await readdir(agentsDir)).filter((f) => f.endsWith('.md')).sort();
    for (const file of files) {
      const content = await readFile(path.join(agentsDir, file), 'utf-8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const fm = fmMatch ? fmMatch[1] : '';
      const nameMatch = fm.match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
      const descMatch = fm.match(/^description:\s*["']?([^"'\r\n]+)["']?/m);
      const id = (nameMatch ? nameMatch[1].trim() : file.replace(/\.md$/, '')) as SubagentRoleId;
      if (!VALID_SUBAGENT_IDS.has(id)) {
        continue;
      }

      const body = content.replace(/^---[\s\S]*?---/, '').trim();
      const titleName = id
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      specs.push({
        id,
        name: titleName,
        role: descMatch ? descMatch[1].trim() : `${titleName} specialist subagent`,
        systemPrompt: body.slice(0, 1600),
        boundAdapter: SUBAGENT_ADAPTER_MAP[id],
      });
    }
  } catch (err: unknown) {
    void err;
  }

  return specs;
}

/**
 * Executes a deterministic Skill-as-a-Tool (SaaT) action through `skill-dispatcher.mjs`.
 */
export async function executeSkillAction(request: SkillActionRequest): Promise<SkillActionResponse> {
  if (!(await isVibesPluginInstalled())) {
    return {
      status: 'failure',
      skill: request.skill,
      action: request.action,
      durationMs: 0,
      error: {
        code: 'VIBES_PLUGIN_NOT_FOUND',
        message: `vibes-plug was not found at ${resolveVibesPluginRoot()}. Set VIBES_PLUG_ROOT or install vibes-plug.`,
      },
    };
  }

  const mod = await importPluginModule<SkillDispatcherModule>('scripts/skill-dispatcher.mjs');
  return mod.dispatchSkillAction({
    skill: request.skill,
    action: request.action,
    payload: request.payload || {},
    options: request.options || {},
  });
}

/**
 * Executes an Autonomous Skill Composition Chain recipe through `skill-dispatcher.mjs`.
 */
export async function executeSkillChain(
  recipeName: string,
  payload: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  if (!(await isVibesPluginInstalled())) {
    return {
      status: 'failure',
      recipe: recipeName,
      error: {
        code: 'VIBES_PLUGIN_NOT_FOUND',
        message: `vibes-plug was not found at ${resolveVibesPluginRoot()}.`,
      },
    };
  }

  const mod = await importPluginModule<SkillDispatcherModule>('scripts/skill-dispatcher.mjs');
  return mod.dispatchSkillChain(recipeName, payload);
}

/**
 * Lists all available Autonomous Skill Composition Chain recipes.
 */
export async function listSkillChainRecipes(): Promise<
  Record<string, { name: string; description: string; steps: Array<{ skill: string; action: string }> }>
> {
  if (!(await isVibesPluginInstalled())) {
    return {};
  }
  const mod = await importPluginModule<SkillDispatcherModule>('scripts/skill-dispatcher.mjs');
  return mod.SKILL_CHAIN_RECIPES || {};
}

/**
 * Retrieves the compact micro-slice for a specific skill.
 */
export async function fetchSkillCompactSlice(skillName: string): Promise<SkillSlice | null> {
  const map = await loadSkillSlicesMap();
  if (map[skillName]) {
    return map[skillName];
  }
  if (!(await isVibesPluginInstalled())) {
    return null;
  }
  const mod = await importPluginModule<SkillDispatcherModule>('scripts/skill-dispatcher.mjs');
  return mod.getSkillCompactSlice(skillName);
}

/**
 * Evaluates deterministic AST/Regex guard rules across the 178-skill guardrail engine.
 */
export async function evaluateGuardRules(params: {
  skill?: string;
  filePath?: string;
  code?: string;
  prompt?: string;
}): Promise<GuardEvaluationResult> {
  if (!(await isVibesPluginInstalled())) {
    return {
      matchedSkills: [],
      rulesEvaluated: 0,
      passed: true,
      errorCount: 0,
      warnCount: 0,
      findingsCount: 0,
      findings: [],
    };
  }

  const mod = await importPluginModule<SkillRulesEngineModule>('scripts/skill-rules-engine.mjs');
  return mod.evaluateContextualSkillGuards(params);
}

/**
 * Returns total deterministic guard rule count and guarded skill count from `skill-rules-engine.mjs`.
 */
export async function getGuardRulesStats(): Promise<{ guardedSkillsCount: number; totalRulesCount: number }> {
  if (!(await isVibesPluginInstalled())) {
    return { guardedSkillsCount: 0, totalRulesCount: 0 };
  }
  const mod = await importPluginModule<SkillRulesEngineModule>('scripts/skill-rules-engine.mjs');
  const entries = Object.values(mod.SKILL_GUARD_RULES || {});
  const totalRulesCount = entries.reduce((sum, rules) => sum + rules.length, 0);
  return {
    guardedSkillsCount: Object.keys(mod.SKILL_GUARD_RULES || {}).length,
    totalRulesCount,
  };
}

/**
 * Auto-matches relevant skills for a target file, code snippet, or user prompt.
 */
export async function matchContextualSkills(params: {
  filePath?: string;
  code?: string;
  prompt?: string;
}): Promise<string[]> {
  if (!(await isVibesPluginInstalled())) {
    return [];
  }
  const mod = await importPluginModule<SkillRulesEngineModule>('scripts/skill-rules-engine.mjs');
  return mod.matchSkillsForTarget(params);
}

/**
 * Resolves a dynamic thinking budget profile using `swarm-runner.mjs`.
 */
export async function resolveTaskReasoningProfile(
  taskDescription: string,
  requestedProfile?: ReasoningProfileId | string
): Promise<ReasoningProfile> {
  if (await isVibesPluginInstalled()) {
    const runner = await importPluginModule<SwarmRunnerModule>('scripts/swarm-runner.mjs');
    return runner.resolveReasoningProfile(taskDescription, requestedProfile || null);
  }
  return {
    id: 'balanced',
    name: 'Balanced',
    tier: 'Flash / Sonnet',
    budgetTokens: 8192,
    description: 'Default fallback reasoning profile',
  };
}

/**
 * Plans a multi-agent swarm topology, specialist assignments, and thinking budgets.
 */
export async function planSwarmTask(
  taskDescription: string,
  options?: { reasoning?: ReasoningProfileId | string; topology?: SwarmTopology }
): Promise<SwarmExecutionPlan> {
  if (await isVibesPluginInstalled()) {
    const runner = await importPluginModule<SwarmRunnerModule>('scripts/swarm-runner.mjs');
    const dispatcher = await importPluginModule<SwarmDispatcherModule>('scripts/swarm-dispatcher.mjs');
    const rawPlan = runner.planSwarm(taskDescription, { reasoning: options?.reasoning });
    const normalizedSubagents = rawPlan.subagents.map((item) => ({
      ...item,
      subagent: (item.subagent && VALID_SUBAGENT_IDS.has(item.subagent)
        ? item.subagent
        : dispatcher.resolveNativeSubagent(item.skill, item.name)) as SubagentRoleId,
    }));

    return {
      ...rawPlan,
      topology: options?.topology || rawPlan.topology,
      subagents: normalizedSubagents,
    };
  }

  return {
    topology: options?.topology || 'fan_out_fan_in',
    subagents: [
      {
        name: 'Core Implementation',
        skill: 'fullstack-expert',
        subagent: 'fullstack-craftsman',
        focus: 'Fullstack delivery',
        thinkingBudget: 'balanced (8,192 tokens)',
      },
    ],
    totalWorkers: 1,
    reasoningProfile: 'balanced',
    thinkingBudgetTokens: 8192,
    targetModelTier: 'Flash / Sonnet',
    estimatedTokenCost: 8192,
    estimatedRuntimeMs: 350,
  };
}

/**
 * Dispatches the headless vibes-plug swarm engine for deterministic offline or preflight runs.
 */
export async function dispatchHeadlessSwarm(
  taskDescription: string,
  options?: { concurrency?: number; reasoning?: ReasoningProfileId | string }
): Promise<Record<string, unknown>> {
  if (!(await isVibesPluginInstalled())) {
    throw new Error(`vibes-plug not found at ${resolveVibesPluginRoot()}`);
  }
  const dispatcher = await importPluginModule<SwarmDispatcherModule>('scripts/swarm-dispatcher.mjs');
  return dispatcher.dispatchSwarm(taskDescription, {
    concurrency: options?.concurrency ?? 3,
    reasoning: options?.reasoning,
  });
}

/**
 * Emits a lifecycle telemetry event onto the Swarm Concurrency Bus.
 */
export async function publishSwarmEvent(
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  if (!(await isVibesPluginInstalled())) {
    return;
  }
  const busMod = await importPluginModule<SwarmBusModule>('scripts/swarm-bus.mjs');
  busMod.emitSwarmEvent(eventType, payload);
}

/**
 * Reads the Swarm Blackboard state from both workspace memory and vibes-plug memory.
 */
export async function getBlackboardState(): Promise<Record<string, unknown>> {
  const pluginBlackboardPath = path.join(resolveVibesPluginRoot(), '.agents', 'memory', 'blackboard_state.json');
  let pluginState: Record<string, unknown> = {};
  try {
    const raw = await readFile(pluginBlackboardPath, 'utf-8');
    pluginState = JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    void err;
  }

  if (await isVibesPluginInstalled()) {
    const busMod = await importPluginModule<SwarmBusModule>('scripts/swarm-bus.mjs');
    const workspaceEntries = busMod.swarmBus.listBlackboard();
    return {
      autoSwarm: Boolean(pluginState.auto_swarm ?? true),
      pluginUpdatedAt: pluginState.updatedAt || null,
      pluginEntries: pluginState.entries || {},
      workspaceEntries,
    };
  }

  return {
    autoSwarm: Boolean(pluginState.auto_swarm ?? true),
    pluginUpdatedAt: pluginState.updatedAt || null,
    pluginEntries: pluginState.entries || {},
    workspaceEntries: [],
  };
}

/**
 * Writes or updates a shared contract entry on the Swarm Blackboard.
 */
export async function setBlackboardEntry(
  key: string,
  value: unknown,
  author: string = 'macli-director'
): Promise<Record<string, unknown>> {
  if (!(await isVibesPluginInstalled())) {
    throw new Error(`vibes-plug not found at ${resolveVibesPluginRoot()}`);
  }
  const busMod = await importPluginModule<SwarmBusModule>('scripts/swarm-bus.mjs');
  return busMod.swarmBus.setBlackboard(key, value, author);
}

import { DynamicStructuredTool } from '@langchain/core/tools';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  evaluateGuardRules,
  executeSkillAction,
  executeSkillChain,
  getBlackboardState,
  setBlackboardEntry,
} from '../vibesBridge';

export const vibesSkillDispatchTool = new DynamicStructuredTool({
  name: 'vibes_skill_dispatch',
  description:
    'Execute a deterministic Skill-as-a-Tool (SaaT) action (audit, eval, verify, generate, fuzz, optimize, slice, blueprint, extract-code, rules, health, budget) across any of the 178 vibes-plug skills or "auto".',
  schema: z.object({
    skill: z
      .string()
      .describe('Exact skill slug (e.g. "database-orm-expert", "tailwind-expert") or "auto"'),
    action: z
      .string()
      .describe(
        'Action name: audit, eval, verify, generate, fuzz, optimize, slice, blueprint, extract-code, rules, health, or budget'
      ),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Action payload such as { filePath, code, sql, spec, task }'),
  }),
  func: async ({ skill, action, payload }) => {
    const response = await executeSkillAction({
      skill,
      action,
      payload: payload || {},
    });
    return JSON.stringify(response);
  },
});

export const vibesSkillChainTool = new DynamicStructuredTool({
  name: 'vibes_skill_chain',
  description:
    'Execute an Autonomous Skill Composition Chain (e.g. saas-launch-gate, ai-agent-hardening, fintech-settlement-gate, cloud-release-gate, frontend-ui-polish, rea-binary-audit-gate, spatial-3d-webgpu-gate, local-first-sync-gate, formal-neurosymbolic-gate).',
  schema: z.object({
    recipe: z.string().describe('Chain recipe identifier'),
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Shared verification payload forwarded to all steps in the chain'),
  }),
  func: async ({ recipe, payload }) => {
    const result = await executeSkillChain(recipe, payload || {});
    return JSON.stringify(result);
  },
});

export const vibesGuardAuditTool = new DynamicStructuredTool({
  name: 'vibes_guard_audit',
  description:
    'Evaluate code or a file against the 356+ deterministic AST/Regex guard rules in vibes-plug skill-rules-engine.',
  schema: z.object({
    filePath: z.string().optional().describe('Optional path to a file on disk to inspect'),
    code: z.string().optional().describe('Source code snippet to evaluate'),
    skill: z.string().optional().describe('Optional specific skill slug to force-evaluate'),
    prompt: z.string().optional().describe('Optional task context for contextual skill routing'),
  }),
  func: async ({ filePath, code, skill, prompt }) => {
    let targetCode = code;
    if (!targetCode && filePath) {
      try {
        targetCode = await readFile(path.resolve(process.cwd(), filePath), 'utf-8');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({
          passed: false,
          errorCount: 1,
          findingsCount: 1,
          findings: [
            {
              skill: skill || 'system',
              ruleId: 'FILE_READ_FAILED',
              severity: 'ERROR',
              name: 'Target file unreadable',
              remediation: message,
            },
          ],
        });
      }
    }

    const evaluation = await evaluateGuardRules({
      filePath,
      code: targetCode,
      skill,
      prompt,
    });
    return JSON.stringify(evaluation);
  },
});

export const vibesBlackboardTool = new DynamicStructuredTool({
  name: 'vibes_blackboard',
  description: 'Read or write shared contracts on the persistent Swarm Blackboard.',
  schema: z.object({
    operation: z.enum(['get', 'set', 'list']).describe('Blackboard operation'),
    key: z.string().optional().describe('Contract key (required for get and set)'),
    value: z.unknown().optional().describe('Contract value (required for set)'),
    author: z.string().optional().describe('Optional subagent author identifier'),
  }),
  func: async ({ operation, key, value, author }) => {
    if (operation === 'set') {
      if (!key) {
        return JSON.stringify({ error: 'Key is required for blackboard set operation.' });
      }
      const updated = await setBlackboardEntry(key, value ?? null, author || 'macli-agent');
      return JSON.stringify(updated);
    }

    const state = await getBlackboardState();
    if (operation === 'get' && key) {
      const workspaceEntries = (state.workspaceEntries as Array<Record<string, unknown>>) || [];
      const foundWorkspace = workspaceEntries.find((entry) => entry.key === key);
      const pluginEntries = (state.pluginEntries as Record<string, unknown>) || {};
      return JSON.stringify(foundWorkspace || pluginEntries[key] || null);
    }
    return JSON.stringify(state);
  },
});

/**
 * Returns native LangChain tools wrapping vibes-plug SaaT dispatcher, chains, guardrails, and Blackboard.
 */
export const getVibesTools = () => [
  vibesSkillDispatchTool,
  vibesSkillChainTool,
  vibesGuardAuditTool,
  vibesBlackboardTool,
];

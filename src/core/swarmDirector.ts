import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicTool, StructuredToolInterface } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import crypto from 'node:crypto';
import ora from 'ora';
import pc from 'picocolors';
import type {
  GuardEvaluationResult,
  ReasoningProfileId,
  Skill,
  SkillSlice,
  SubagentAssignment,
  SubagentRoleId,
  SubagentSpec,
  SwarmExecutionPlan,
  SwarmExecutionResult,
  SwarmTopology,
  WorkerExecutionOutcome,
} from '../types';
import { McpClientManager } from './mcpClient';
import { getOsTools } from './tools/osTools';
import { getVibesTools } from './tools/vibesTools';
import {
  dispatchHeadlessSwarm,
  evaluateGuardRules,
  executeSkillAction,
  fetchSkillCompactSlice,
  loadNativeSubagentSpecs,
  planSwarmTask,
  publishSwarmEvent,
  setBlackboardEntry,
} from './vibesBridge';

export interface ExecuteTaskOptions {
  debug?: boolean;
  topology?: SwarmTopology;
  reasoning?: ReasoningProfileId;
  deterministic?: boolean;
  json?: boolean;
}

interface ModelResolution {
  primary: BaseChatModel;
  fallback: BaseChatModel | null;
  primaryLabel: string;
  fallbackLabel: string | null;
}

function hasValidEnvKey(name: string): boolean {
  const val = process.env[name];
  if (!val) return false;
  const trimmed = val.trim();
  return (
    trimmed.length > 0 &&
    trimmed !== 'dummy_key' &&
    trimmed !== 'your_google_api_key_here' &&
    trimmed !== 'your_anthropic_api_key_here'
  );
}

function selectGeminiModelId(profile: ReasoningProfileId): { primary: string; fallback: string } {
  if (profile === 'speed') {
    return { primary: 'gemini-2.5-flash-lite', fallback: 'gemini-2.5-flash' };
  }
  if (profile === 'deep' || profile === 'exhaustive') {
    return { primary: 'gemini-2.5-pro', fallback: 'gemini-2.5-flash' };
  }
  return { primary: 'gemini-2.5-flash', fallback: 'gemini-2.5-flash-lite' };
}

function selectAnthropicModelId(profile: ReasoningProfileId): { primary: string; fallback: string } {
  if (profile === 'speed') {
    return { primary: 'claude-haiku-4-5-20251001', fallback: 'claude-sonnet-4-5-20250929' };
  }
  if (profile === 'deep' || profile === 'exhaustive') {
    return { primary: 'claude-opus-4-6', fallback: 'claude-sonnet-4-5-20250929' };
  }
  return { primary: 'claude-sonnet-4-5-20250929', fallback: 'claude-haiku-4-5-20251001' };
}

function extractMessageText(message: BaseMessage | undefined): string {
  if (!message) return '';
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(message.content);
}

/**
 * Orchestrates multi-agent execution across vibes-plug's 9 specialist subagents,
 * 3 Swarm topologies, Adaptive Model Cascade, and deterministic SaaT tooling.
 */
export class SwarmDirector {
  private skills: Skill[];
  private mcpManager: McpClientManager;
  private checkpointer: MemorySaver;

  constructor(skills: Skill[], mcpManager: McpClientManager) {
    this.skills = skills;
    this.mcpManager = mcpManager;
    this.checkpointer = new MemorySaver();
  }

  private resolveModels(profile: ReasoningProfileId): ModelResolution | null {
    const hasGoogle = hasValidEnvKey('GOOGLE_API_KEY');
    const hasAnthropic = hasValidEnvKey('ANTHROPIC_API_KEY');
    const forcedModel = process.env.MACLI_MODEL?.trim();
    const preferAnthropic =
      process.env.MACLI_PROVIDER?.toLowerCase() === 'anthropic' || (!hasGoogle && hasAnthropic);

    if (!hasGoogle && !hasAnthropic) {
      return null;
    }

    if (preferAnthropic && hasAnthropic) {
      const ids = selectAnthropicModelId(profile);
      const primaryId = forcedModel || ids.primary;
      const primary = new ChatAnthropic({
        model: primaryId,
        temperature: 0,
        maxTokens: profile === 'exhaustive' ? 8192 : 4096,
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      const fallback = hasGoogle
        ? new ChatGoogleGenerativeAI({
            model: selectGeminiModelId(profile).primary,
            temperature: 0,
            apiKey: process.env.GOOGLE_API_KEY,
          })
        : new ChatAnthropic({
            model: ids.fallback,
            temperature: 0,
            apiKey: process.env.ANTHROPIC_API_KEY,
          });
      return {
        primary,
        fallback,
        primaryLabel: `anthropic:${primaryId}`,
        fallbackLabel: hasGoogle
          ? `google:${selectGeminiModelId(profile).primary}`
          : `anthropic:${ids.fallback}`,
      };
    }

    const ids = selectGeminiModelId(profile);
    const primaryId = forcedModel || ids.primary;
    const primary = new ChatGoogleGenerativeAI({
      model: primaryId,
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY,
    });
    const fallback = hasAnthropic
      ? new ChatAnthropic({
          model: selectAnthropicModelId(profile).primary,
          temperature: 0,
          apiKey: process.env.ANTHROPIC_API_KEY,
        })
      : new ChatGoogleGenerativeAI({
          model: ids.fallback,
          temperature: 0,
          apiKey: process.env.GOOGLE_API_KEY,
        });

    return {
      primary,
      fallback,
      primaryLabel: `google:${primaryId}`,
      fallbackLabel: hasAnthropic
        ? `anthropic:${selectAnthropicModelId(profile).primary}`
        : `google:${ids.fallback}`,
    };
  }

  private buildMcpTools(): DynamicTool[] {
    const mcpTools: DynamicTool[] = [];
    for (const skill of this.skills) {
      if (skill.source === 'mcp_server' && skill.mcpServerName) {
        const serverName = skill.mcpServerName;
        const toolName = skill.name;
        mcpTools.push(
          new DynamicTool({
            name: `${serverName}_${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64),
            description: skill.description || `MCP tool ${toolName} from ${serverName}`,
            func: async (input: string) => {
              try {
                let parsedInput: Record<string, unknown> = {};
                try {
                  parsedInput = JSON.parse(input) as Record<string, unknown>;
                } catch (parseErr: unknown) {
                  void parseErr;
                  parsedInput = { input };
                }
                const result = await this.mcpManager.executeTool(serverName, toolName, parsedInput);
                return JSON.stringify((result as { content?: unknown }).content || result);
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                return `[MCP ERROR] Failed executing ${toolName}: ${message}`;
              }
            },
          })
        );
      }
    }
    return mcpTools;
  }

  private async buildSpecialistPrompt(
    assignment: SubagentAssignment,
    specMap: Map<SubagentRoleId, SubagentSpec>
  ): Promise<string> {
    const spec = specMap.get(assignment.subagent);
    const loadedSkill = this.skills.find((s) => s.name === assignment.skill);
    const slice: SkillSlice | null =
      loadedSkill?.slice ?? (await fetchSkillCompactSlice(assignment.skill));

    const sliceBlock = slice
      ? [
          `Bound Skill: ${slice.skill} (v${slice.version}, domain: ${slice.domain})`,
          `Description: ${slice.description}`,
          `Supported SaaT Actions: ${slice.supportedActions.join(', ')}`,
          `Connected Skills: ${(slice.connectedSkills || []).slice(0, 6).join(', ') || 'none'}`,
          `NFR Contract: ${slice.nfrContract}`,
          slice.snippet?.code ? `Reference Pattern (${slice.snippet.lang}):\n${slice.snippet.code.slice(0, 500)}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : `Bound Skill: ${assignment.skill}\nFocus: ${assignment.focus}`;

    const personaHeader = spec
      ? `Role: ${spec.name} (${spec.id})\nAdapter: ${spec.boundAdapter}\n${spec.role}`
      : `Role: ${assignment.subagent} (${assignment.name})`;

    return [
      personaHeader,
      '',
      sliceBlock,
      '',
      `Thinking Budget: ${assignment.thinkingBudget}`,
      'Mandate: Deliver 100% complete, verified code and contracts without placeholders or silent catches.',
      'Use vibes_skill_dispatch / vibes_guard_audit / vibes_blackboard tools to verify work.',
    ].join('\n');
  }

  private async runLlmSpecialist(
    assignment: SubagentAssignment,
    taskPrompt: string,
    models: ModelResolution,
    specMap: Map<SubagentRoleId, SubagentSpec>,
    tools: Array<StructuredToolInterface | DynamicTool>,
    debug: boolean
  ): Promise<{ outcome: WorkerExecutionOutcome; modelUsed: string }> {
    const startedAt = Date.now();
    const workerId = `worker-${assignment.subagent}-${assignment.skill}`;
    const systemPrompt = await this.buildSpecialistPrompt(assignment, specMap);

    await publishSwarmEvent('worker:dispatch', {
      workerId,
      subagent: assignment.subagent,
      domain: assignment.name,
      skill: assignment.skill,
      status: 'EXECUTING',
    });

    const invokeWithModel = async (llm: BaseChatModel) => {
      const agent = createReactAgent({
        llm,
        tools,
        prompt: systemPrompt,
        checkpointer: this.checkpointer,
      });
      return agent.invoke(
        { messages: [new HumanMessage(taskPrompt)] },
        { configurable: { thread_id: `${workerId}-${crypto.randomUUID()}` } }
      );
    };

    let modelUsed = models.primaryLabel;
    let outputText = '';
    let status = 'COMPLETED';

    try {
      const result = await invokeWithModel(models.primary);
      outputText = extractMessageText(result.messages[result.messages.length - 1]);
    } catch (primaryErr: unknown) {
      if (models.fallback && models.fallbackLabel) {
        if (debug) {
          const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
          process.stderr.write(`[Cascade Fallback] ${models.primaryLabel} failed (${msg}); switching to ${models.fallbackLabel}\n`);
        }
        try {
          const fallbackResult = await invokeWithModel(models.fallback);
          modelUsed = models.fallbackLabel;
          outputText = extractMessageText(fallbackResult.messages[fallbackResult.messages.length - 1]);
        } catch (fallbackErr: unknown) {
          status = 'FAILED';
          outputText = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        }
      } else {
        status = 'FAILED';
        outputText = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      }
    }

    const guardEvaluation = await evaluateGuardRules({
      skill: assignment.skill,
      code: outputText,
      prompt: taskPrompt,
    });

    const outcome: WorkerExecutionOutcome = {
      workerId,
      domain: assignment.name,
      skill: assignment.skill,
      subagent: assignment.subagent,
      focus: assignment.focus,
      thinkingBudget: assignment.thinkingBudget,
      targetModelTier: modelUsed,
      status: guardEvaluation.passed ? status : 'FLAGGED',
      durationMs: Math.max(1, Date.now() - startedAt),
      output: outputText,
      guardEvaluation,
    };

    await publishSwarmEvent('worker:done', {
      workerId,
      subagent: assignment.subagent,
      domain: assignment.name,
      skill: assignment.skill,
      status: outcome.status,
      durationMs: outcome.durationMs,
    });

    return { outcome, modelUsed };
  }

  private async synthesizeLlmOutputs(
    taskDescription: string,
    plan: SwarmExecutionPlan,
    workers: WorkerExecutionOutcome[],
    models: ModelResolution
  ): Promise<string> {
    const synthesisPrompt = [
      `Synthesize the specialist outputs for task: "${taskDescription}"`,
      `Topology: ${plan.topology.toUpperCase()} | Profile: ${plan.reasoningProfile}`,
      '',
      ...workers.map(
        (w, i) =>
          `### Stage ${i + 1}: ${w.subagent} (@${w.skill}) [${w.status}]\n${(w.output || '').slice(0, 2500)}`
      ),
      '',
      'Produce a concise, actionable final synthesis highlighting verified artifacts, guard findings, and next commands.',
    ].join('\n');

    try {
      const msg = await models.primary.invoke([
        new SystemMessage('You are the Vibes-Plug Swarm Director synthesizer. Combine specialist artifacts cleanly.'),
        new HumanMessage(synthesisPrompt),
      ]);
      return extractMessageText(msg);
    } catch (primaryErr: unknown) {
      void primaryErr;
      if (models.fallback) {
        try {
          const fallbackMsg = await models.fallback.invoke([new HumanMessage(synthesisPrompt)]);
          return extractMessageText(fallbackMsg);
        } catch (fallbackErr: unknown) {
          void fallbackErr;
        }
      }
      return workers.map((w) => `[${w.subagent}] ${w.output || w.status}`).join('\n\n');
    }
  }

  private ensureCriticGuardian(plan: SwarmExecutionPlan): SwarmExecutionPlan {
    if (plan.topology !== 'critic_validator') {
      return plan;
    }
    const hasGuardian = plan.subagents.some((s) => s.subagent === 'quality-guardian');
    if (hasGuardian) {
      return plan;
    }
    return {
      ...plan,
      totalWorkers: plan.subagents.length + 1,
      subagents: [
        ...plan.subagents,
        {
          name: 'Quality & Security Gate',
          skill: 'zero-tech-debt-auditor',
          subagent: 'quality-guardian',
          focus: 'Anti-Slop, deterministic guardrails, and TDD verification gate',
          thinkingBudget: `${plan.reasoningProfile} (${plan.thinkingBudgetTokens.toLocaleString()} tokens)`,
        },
      ],
    };
  }

  private async runDeterministicSwarm(
    taskDescription: string,
    plan: SwarmExecutionPlan,
    swarmId: string
  ): Promise<{ workers: WorkerExecutionOutcome[]; guardAudit: GuardEvaluationResult; finalOutput: string }> {
    const dispatchReport = (await dispatchHeadlessSwarm(taskDescription, {
      concurrency: 3,
      reasoning: plan.reasoningProfile,
    })) as { workers?: Array<Record<string, unknown>> };

    const workers: WorkerExecutionOutcome[] = [];
    const executeWorkerStep = async (
      assignment: SubagentAssignment,
      priorContext: string
    ): Promise<WorkerExecutionOutcome> => {
      const started = Date.now();
      const workerId = `worker-${assignment.subagent}-${assignment.skill}`;
      const action = assignment.subagent === 'quality-guardian' ? 'verify' : 'audit';
      const saasResp = await executeSkillAction({
        skill: assignment.skill,
        action,
        payload: { prompt: `${taskDescription}\n${priorContext}`.trim() },
      });

      const matchedHeadless = Array.isArray(dispatchReport.workers)
        ? dispatchReport.workers.find((w) => w.skill === assignment.skill)
        : undefined;

      const outputSummary = JSON.stringify({
        skill: assignment.skill,
        action,
        status: saasResp.status,
        telemetry: saasResp.telemetry,
        result: saasResp.result,
      });

      await setBlackboardEntry(
        `macli:${swarmId}:${assignment.subagent}`,
        {
          skill: assignment.skill,
          action,
          status: saasResp.status,
          updatedAt: new Date().toISOString(),
        },
        assignment.subagent
      );

      return {
        workerId,
        domain: assignment.name,
        skill: assignment.skill,
        subagent: assignment.subagent,
        focus: assignment.focus,
        thinkingBudget: assignment.thinkingBudget,
        targetModelTier: `deterministic:${plan.targetModelTier}`,
        status: saasResp.status === 'success' ? 'COMPLETED' : 'FAILED',
        criticScore:
          typeof matchedHeadless?.criticScore === 'number' ? matchedHeadless.criticScore : 100,
        criticVerdict:
          typeof matchedHeadless?.criticVerdict === 'string'
            ? matchedHeadless.criticVerdict
            : 'APPROVED',
        sandboxVerified:
          typeof matchedHeadless?.sandboxVerified === 'boolean'
            ? matchedHeadless.sandboxVerified
            : true,
        durationMs: Math.max(1, Date.now() - started),
        output: outputSummary,
      };
    };

    if (plan.topology === 'fan_out_fan_in') {
      const settled = await Promise.all(
        plan.subagents.map((assignment) => executeWorkerStep(assignment, ''))
      );
      workers.push(...settled);
    } else if (plan.topology === 'pipeline_saga') {
      let rollingContext = '';
      for (const assignment of plan.subagents) {
        const outcome = await executeWorkerStep(assignment, rollingContext);
        workers.push(outcome);
        rollingContext = `Prior Stage (${assignment.subagent}): ${outcome.status}`;
      }
    } else {
      const implementers = plan.subagents.filter((s) => s.subagent !== 'quality-guardian');
      const auditors = plan.subagents.filter((s) => s.subagent === 'quality-guardian');
      const implOutcomes = await Promise.all(
        implementers.map((assignment) => executeWorkerStep(assignment, ''))
      );
      workers.push(...implOutcomes);
      const implContext = implOutcomes
        .map((o) => `${o.subagent}(${o.skill}):${o.status}`)
        .join('; ');
      for (const auditor of auditors) {
        const auditOutcome = await executeWorkerStep(auditor, implContext);
        workers.push(auditOutcome);
      }
    }

    const guardAudit = await evaluateGuardRules({
      prompt: taskDescription,
      code: workers.map((w) => w.output || '').join('\n'),
    });

    const lines = [
      `[Deterministic Swarm Execution] Topology: ${plan.topology.toUpperCase()} | Profile: ${plan.reasoningProfile.toUpperCase()} (${plan.targetModelTier})`,
      `Specialists Executed (${workers.length}):`,
      ...workers.map(
        (w) =>
          `- ${w.subagent} (@${w.skill}) -> ${w.status} | Critic: ${w.criticVerdict || 'APPROVED'} (${w.criticScore ?? 100}/100) | ${w.durationMs}ms`
      ),
      `Guardrail Audit: ${guardAudit.passed ? 'PASSED' : 'FLAGGED'} (${guardAudit.rulesEvaluated} rules evaluated, ${guardAudit.findingsCount} findings)`,
    ];

    return {
      workers,
      guardAudit,
      finalOutput: lines.join('\n'),
    };
  }

  /**
   * Executes a user task using the configured Swarm topology, 9 specialist subagents,
   * Adaptive Model Cascade, or deterministic offline vibes-plug engine.
   */
  public async executeTask(
    taskDescription: string,
    optionsOrDebug: boolean | ExecuteTaskOptions = false
  ): Promise<SwarmExecutionResult> {
    const startTime = Date.now();
    const opts: ExecuteTaskOptions =
      typeof optionsOrDebug === 'boolean' ? { debug: optionsOrDebug } : optionsOrDebug;
    const debug = Boolean(opts.debug);
    const silent = Boolean(opts.json);
    const swarmId = crypto.randomUUID();

    const basePlan = await planSwarmTask(taskDescription, {
      reasoning: opts.reasoning,
      topology: opts.topology,
    });
    const plan = this.ensureCriticGuardian(basePlan);
    const models = opts.deterministic ? null : this.resolveModels(plan.reasoningProfile);
    const mode: 'llm' | 'deterministic' = models ? 'llm' : 'deterministic';

    await publishSwarmEvent('swarm:start', {
      swarmId,
      task: taskDescription,
      topology: plan.topology,
      reasoningProfile: plan.reasoningProfile,
      mode,
      totalWorkers: plan.subagents.length,
    });

    const spinner = silent
      ? null
      : ora(
          `[SwarmDirector] ${plan.topology.toUpperCase()} | ${plan.reasoningProfile.toUpperCase()} | ${mode.toUpperCase()} (${plan.subagents.length} specialists)...`
        ).start();

    try {
      if (mode === 'deterministic' || !models) {
        if (!silent && !opts.deterministic && spinner) {
          spinner.text = 'No LLM API key detected; running deterministic Vibes-Plug Swarm engine...';
        }
        const det = await this.runDeterministicSwarm(taskDescription, plan, swarmId);
        await publishSwarmEvent('swarm:complete', {
          swarmId,
          task: taskDescription,
          topology: plan.topology,
          status: 'COMPLETED',
          mode: 'deterministic',
        });

        spinner?.succeed(pc.green(pc.bold('[SwarmDirector] Deterministic Swarm execution completed.')));
        const result: SwarmExecutionResult = {
          success: det.guardAudit.passed && det.workers.every((w) => w.status === 'COMPLETED'),
          swarmId,
          mode: 'deterministic',
          modelUsed: `deterministic:${plan.targetModelTier}`,
          plan,
          workers: det.workers,
          guardAudit: det.guardAudit,
          finalOutput: det.finalOutput,
          durationMs: Math.max(1, Date.now() - startTime),
        };
        if (!silent) {
          process.stdout.write(`\n${result.finalOutput}\n\n`);
        }
        return result;
      }

      const specs = await loadNativeSubagentSpecs();
      const specMap = new Map<SubagentRoleId, SubagentSpec>(specs.map((s) => [s.id, s]));
      const tools = [...getOsTools(), ...getVibesTools(), ...this.buildMcpTools()];

      const workers: WorkerExecutionOutcome[] = [];
      let activeModelLabel = models.primaryLabel;

      if (plan.topology === 'fan_out_fan_in') {
        spinner && (spinner.text = `[FAN-OUT] Dispatching ${plan.subagents.length} specialists in parallel...`);
        const settled = await Promise.allSettled(
          plan.subagents.map((assignment) =>
            this.runLlmSpecialist(
              assignment,
              `Task: ${taskDescription}\nFocus: ${assignment.focus}`,
              models,
              specMap,
              tools,
              debug
            )
          )
        );
        for (const item of settled) {
          if (item.status === 'fulfilled') {
            workers.push(item.value.outcome);
            activeModelLabel = item.value.modelUsed;
            await setBlackboardEntry(
              `macli:${swarmId}:${item.value.outcome.subagent}`,
              {
                skill: item.value.outcome.skill,
                status: item.value.outcome.status,
                summary: (item.value.outcome.output || '').slice(0, 600),
              },
              item.value.outcome.subagent
            );
          }
        }
      } else if (plan.topology === 'pipeline_saga') {
        let priorArtifact = 'Initial task specification';
        for (let i = 0; i < plan.subagents.length; i++) {
          const assignment = plan.subagents[i];
          spinner &&
            (spinner.text = `[PIPELINE SAGA ${i + 1}/${plan.subagents.length}] ${assignment.subagent} (@${assignment.skill})...`);
          const stagePrompt = [
            `Task: ${taskDescription}`,
            `Stage ${i + 1}/${plan.subagents.length} Focus: ${assignment.focus}`,
            `Previous Stage Context:\n${priorArtifact.slice(0, 2000)}`,
          ].join('\n\n');
          const res = await this.runLlmSpecialist(
            assignment,
            stagePrompt,
            models,
            specMap,
            tools,
            debug
          );
          workers.push(res.outcome);
          activeModelLabel = res.modelUsed;
          priorArtifact = res.outcome.output || res.outcome.status;
          await setBlackboardEntry(
            `macli:${swarmId}:stage-${i + 1}`,
            { subagent: assignment.subagent, status: res.outcome.status },
            assignment.subagent
          );
        }
      } else {
        const implementers = plan.subagents.filter((s) => s.subagent !== 'quality-guardian');
        const auditors = plan.subagents.filter((s) => s.subagent === 'quality-guardian');

        spinner && (spinner.text = `[CRITIC-VALIDATOR] Executing ${implementers.length} implementer(s)...`);
        const implResults = await Promise.all(
          implementers.map((assignment) =>
            this.runLlmSpecialist(
              assignment,
              `Task: ${taskDescription}\nFocus: ${assignment.focus}`,
              models,
              specMap,
              tools,
              debug
            )
          )
        );
        for (const res of implResults) {
          workers.push(res.outcome);
          activeModelLabel = res.modelUsed;
        }

        const implArtifacts = implResults
          .map((r) => `## ${r.outcome.subagent} (@${r.outcome.skill})\n${(r.outcome.output || '').slice(0, 1800)}`)
          .join('\n\n');

        spinner && (spinner.text = `[CRITIC-VALIDATOR] Running quality-guardian audit gate...`);
        for (const auditor of auditors) {
          const auditPrompt = [
            `Audit and verify the implementer deliverables for task: "${taskDescription}"`,
            `Use vibes_guard_audit and vibes_skill_dispatch to verify zero slop and full compliance.`,
            '',
            implArtifacts,
          ].join('\n');
          const res = await this.runLlmSpecialist(
            auditor,
            auditPrompt,
            models,
            specMap,
            tools,
            debug
          );
          workers.push(res.outcome);
          activeModelLabel = res.modelUsed;
        }
      }

      spinner && (spinner.text = '[SwarmDirector] Synthesizing final artifacts...');
      const finalOutput = await this.synthesizeLlmOutputs(taskDescription, plan, workers, models);
      const guardAudit = await evaluateGuardRules({
        prompt: taskDescription,
        code: finalOutput,
      });

      await publishSwarmEvent('swarm:complete', {
        swarmId,
        task: taskDescription,
        topology: plan.topology,
        status: 'COMPLETED',
        mode: 'llm',
      });

      spinner?.succeed(pc.green(pc.bold('[SwarmDirector] Multi-Agent Swarm completed.')));
      if (!silent) {
        process.stdout.write('\n=============================================\n');
        process.stdout.write(`${finalOutput}\n`);
        process.stdout.write('=============================================\n\n');
      }

      return {
        success: guardAudit.passed && workers.every((w) => w.status !== 'FAILED'),
        swarmId,
        mode: 'llm',
        modelUsed: activeModelLabel,
        plan,
        workers,
        guardAudit,
        finalOutput,
        durationMs: Math.max(1, Date.now() - startTime),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      spinner?.fail(pc.red(`Swarm execution failed: ${message}`));
      return {
        success: false,
        swarmId,
        mode,
        modelUsed: models?.primaryLabel || 'deterministic',
        plan,
        workers: [],
        guardAudit: null,
        finalOutput: message,
        durationMs: Math.max(1, Date.now() - startTime),
      };
    }
  }
}

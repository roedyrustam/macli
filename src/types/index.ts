export type SkillDomain =
  | 'discovery'
  | 'ui-ux'
  | 'frontend'
  | 'mobile-desktop'
  | 'backend-runtimes'
  | 'api-contracts'
  | 'database-storage'
  | 'architecture-scale'
  | 'ai-llm'
  | 'saas-fintech'
  | 'testing-security'
  | 'devops-cicd';

export type SubagentRoleId =
  | 'swarm-architect'
  | 'fullstack-craftsman'
  | 'quality-guardian'
  | 'data-rag-architect'
  | 'fintech-payment-sentinel'
  | 'cloud-devops-sre'
  | 'ai-mcp-engineer'
  | 'mobile-spatial-craftsman'
  | 'reverse-security-auditor';

export type SwarmTopology = 'fan_out_fan_in' | 'pipeline_saga' | 'critic_validator';

export type ReasoningProfileId = 'speed' | 'balanced' | 'deep' | 'exhaustive';

export interface ReasoningProfile {
  id: ReasoningProfileId;
  name: string;
  tier: string;
  budgetTokens: number;
  description: string;
}

export interface CodeBlueprintPreview {
  title: string;
  language: string;
  lines: number;
  preview: string;
}

export interface SkillSlice {
  skill: string;
  version: string;
  domain: SkillDomain | string;
  description: string;
  actions?: string[];
  supportedActions: string[];
  guardRulesCount: number;
  nfrContract: string;
  codeBlueprintsCount: number;
  languagesAvailable: string[];
  codeBlueprints?: CodeBlueprintPreview[];
  connectedSkillsCount?: number;
  connectedSkills?: string[];
  fallback?: string;
  cli?: string;
  snippet?: {
    lang: string;
    code: string;
  };
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: 'antigravity' | 'claude' | 'mcp_server';
  content?: string;
  version?: string;
  author?: string;
  domain?: SkillDomain | string;
  supportedActions?: string[];
  guardRulesCount?: number;
  codeBlueprintsCount?: number;
  connectedSkills?: string[];
  nfrContract?: string;
  slice?: SkillSlice;
  mcpServerName?: string;
  mcpToolArgsSchema?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SkillActionRequest {
  skill: string;
  action: string;
  payload?: Record<string, unknown>;
  options?: {
    format?: 'json' | 'table' | 'pretty';
    strict?: boolean;
    timeoutMs?: number;
    recordTelemetry?: boolean;
  };
}

export interface SkillActionResponse<T = unknown> {
  status: 'success' | 'failure';
  skill: string;
  action: string;
  durationMs: number;
  telemetry?: {
    fullSkillTokens: number;
    responseTokens: number;
    tokensSaved: number;
    tokenReductionPercent: string;
    estimatedSavingsUsd: number;
  };
  result?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface GuardFinding {
  skill: string;
  ruleId: string;
  severity: 'ERROR' | 'WARN' | 'INFO' | string;
  name: string;
  remediation: string;
}

export interface GuardEvaluationResult {
  matchedSkills: string[];
  rulesEvaluated: number;
  passed: boolean;
  errorCount: number;
  warnCount: number;
  findingsCount: number;
  findings: GuardFinding[];
}

export interface SubagentSpec {
  id: SubagentRoleId;
  name: string;
  role: string;
  systemPrompt: string;
  boundAdapter: string;
}

export interface SubagentAssignment {
  name: string;
  skill: string;
  subagent: SubagentRoleId;
  focus: string;
  thinkingBudget: string;
}

export interface SwarmExecutionPlan {
  topology: SwarmTopology;
  subagents: SubagentAssignment[];
  totalWorkers: number;
  reasoningProfile: ReasoningProfileId;
  thinkingBudgetTokens: number;
  targetModelTier: string;
  estimatedTokenCost: number;
  estimatedRuntimeMs: number;
}

export interface WorkerExecutionOutcome {
  workerId: string;
  domain: string;
  skill: string;
  subagent: SubagentRoleId;
  focus: string;
  thinkingBudget: string;
  targetModelTier: string;
  status: string;
  criticScore?: number;
  criticVerdict?: string;
  sandboxVerified?: boolean;
  durationMs: number;
  output?: string;
  guardEvaluation?: GuardEvaluationResult;
}

export interface SwarmExecutionResult {
  success: boolean;
  swarmId: string;
  mode: 'llm' | 'deterministic';
  modelUsed: string;
  plan: SwarmExecutionPlan;
  workers: WorkerExecutionOutcome[];
  guardAudit: GuardEvaluationResult | null;
  finalOutput: string;
  durationMs: number;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

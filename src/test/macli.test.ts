import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { McpClientManager } from '../core/mcpClient';
import {
  loadGlobalSkills,
  loadSkills,
  loadVibesMcpConfig,
  parseSkillMarkdown,
} from '../core/skillLoader';
import { SwarmDirector } from '../core/swarmDirector';
import {
  evaluateGuardRules,
  executeSkillAction,
  executeSkillChain,
  getBlackboardState,
  loadNativeSubagentSpecs,
} from '../core/vibesBridge';

const execFileAsync = promisify(execFile);
const CLI_ENTRY = path.resolve(__dirname, '..', 'index.js');

describe('Macli v2.0.0 + Vibes-Plug v4.8.0 Integration Suite', () => {
  it('parses YAML frontmatter, orchestration links, and loads >= 178 enriched global skills', async () => {
    const parsed = parseSkillMarkdown(
      [
        '---',
        'name: custom-demo-skill',
        'description: "Demo skill for parser verification"',
        'version: "4.8.0"',
        'author: "Roedy Rustam"',
        '---',
        '# Custom Skill',
        '### Orchestration & Integration',
        '- `database-orm-expert`: DB safety',
        '- `tailwind-expert`: UI styling',
      ].join('\n'),
      'fallback'
    );

    assert.equal(parsed.name, 'custom-demo-skill');
    assert.equal(parsed.description, 'Demo skill for parser verification');
    assert.equal(parsed.version, '4.8.0');
    assert.deepEqual(parsed.connectedSkills, ['database-orm-expert', 'tailwind-expert']);

    const localSkills = await loadSkills(path.resolve(__dirname, '..', '..', 'examples'));
    assert.ok(localSkills.some((s) => s.name === 'hello-world'));

    const globalSkills = await loadGlobalSkills();
    assert.ok(globalSkills.length >= 178, `Expected >= 178 global skills, got ${globalSkills.length}`);

    const dbSkill = globalSkills.find((s) => s.name === 'database-orm-expert');
    assert.ok(dbSkill, 'database-orm-expert must be loaded');
    assert.equal(dbSkill.domain, 'database-storage');
    assert.ok((dbSkill.supportedActions || []).includes('eval'));
    assert.ok((dbSkill.guardRulesCount || 0) >= 2);
    assert.ok((dbSkill.codeBlueprintsCount || 0) >= 1);
  });

  it('loads all 9 native specialist subagent definitions and vibes-plug MCP config', async () => {
    const specs = await loadNativeSubagentSpecs();
    assert.equal(specs.length, 9);

    const expectedIds = [
      'ai-mcp-engineer',
      'cloud-devops-sre',
      'data-rag-architect',
      'fintech-payment-sentinel',
      'fullstack-craftsman',
      'mobile-spatial-craftsman',
      'quality-guardian',
      'reverse-security-auditor',
      'swarm-architect',
    ];
    assert.deepEqual(
      specs.map((s) => s.id).sort(),
      expectedIds.sort()
    );

    const mcpConfig = await loadVibesMcpConfig();
    assert.ok(mcpConfig['vibes-plug-tools'], 'vibes-plug-tools MCP server must be declared');
    assert.ok(!mcpConfig['vibes-plug-tools'].args.some((a) => a.includes('${PLUGIN_ROOT}')));
  });

  it('executes deterministic SaaT skill actions and multi-skill chains with FinOps telemetry', async () => {
    const dbEval = await executeSkillAction({
      skill: 'database-orm-expert',
      action: 'eval',
      payload: {
        sql: 'CREATE TABLE items (id UUID PRIMARY KEY, tenant_id UUID NOT NULL); ALTER TABLE items ENABLE ROW LEVEL SECURITY;',
      },
    });
    assert.equal(dbEval.status, 'success');
    assert.ok((dbEval.telemetry?.tokensSaved || 0) > 0);

    const tailwindGen = await executeSkillAction({
      skill: 'tailwind-expert',
      action: 'generate',
      payload: { prompt: 'Generate OKLCH surface tokens' },
    });
    assert.equal(tailwindGen.status, 'success');

    const autoAudit = await executeSkillAction({
      skill: 'auto',
      action: 'audit',
      payload: {
        filePath: 'app/page.tsx',
        code: "import Link from 'next/link'; export default async function Page() { return <main>Home</main>; }",
      },
    });
    assert.equal(autoAudit.status, 'success');

    const chainResult = await executeSkillChain('saas-launch-gate', {
      prompt: 'Verify SaaS readiness',
    });
    assert.equal(chainResult.status, 'success');
    assert.equal(chainResult.stepsCount, 5);
  });

  it('evaluates deterministic AST/Regex guard rules and catches known violations', async () => {
    const nextViolation = await evaluateGuardRules({
      skill: 'nextjs-app-router-expert',
      code: 'export default function Page({ params }) { return <div>{params.id}</div>; }',
    });
    assert.equal(nextViolation.passed, false);
    assert.ok(nextViolation.findings.some((f) => f.ruleId === 'NEXT15_SYNC_PARAMS_ACCESS'));

    const twViolation = await evaluateGuardRules({
      skill: 'tailwind-expert',
      code: '@tailwind base;\n@tailwind utilities;',
    });
    assert.equal(twViolation.passed, false);
    assert.ok(twViolation.findings.some((f) => f.ruleId === 'TAILWIND_V4_LEGACY_DIRECTIVES'));

    const cleanCheck = await evaluateGuardRules({
      skill: 'nextjs-app-router-expert',
      code: 'export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <div>{id}</div>; }',
    });
    assert.equal(cleanCheck.passed, true);
  });

  it('executes all 3 Swarm Topologies deterministically and persists Blackboard entries', async () => {
    const globalSkills = await loadGlobalSkills();
    const mcpManager = new McpClientManager();
    const director = new SwarmDirector(globalSkills, mcpManager);

    const topologies = ['fan_out_fan_in', 'pipeline_saga', 'critic_validator'] as const;
    for (const topology of topologies) {
      const outcome = await director.executeTask(
        'Build a multi-tenant Next.js API with PostgreSQL RLS and DOKU payment verification',
        {
          deterministic: true,
          topology,
          reasoning: 'balanced',
          json: true,
        }
      );

      assert.equal(outcome.success, true, `Topology ${topology} failed`);
      assert.equal(outcome.mode, 'deterministic');
      assert.equal(outcome.plan.topology, topology);
      assert.ok(outcome.workers.length >= 2);
      if (topology === 'critic_validator') {
        assert.ok(outcome.workers.some((w) => w.subagent === 'quality-guardian'));
      }
    }

    const bbState = await getBlackboardState();
    assert.equal(bbState.autoSwarm, true);
    assert.ok(Array.isArray(bbState.workspaceEntries));
    assert.ok((bbState.workspaceEntries as Array<unknown>).length > 0);
  });

  it('runs CLI doctor, agents, skill slice, and skill guard commands end-to-end', async () => {
    const { stdout: doctorOut } = await execFileAsync(process.execPath, [CLI_ENTRY, 'doctor', '--json']);
    const doctorJson = JSON.parse(doctorOut);
    assert.equal(doctorJson.status, 'healthy');
    assert.equal(doctorJson.macliVersion, '2.0.0');
    assert.equal(doctorJson.nativeSubagentsCount, 9);
    assert.ok(doctorJson.skillsLoaded >= 178);

    const { stdout: agentsOut } = await execFileAsync(process.execPath, [CLI_ENTRY, 'agents', '--json']);
    const agentsJson = JSON.parse(agentsOut);
    assert.equal(agentsJson.length, 9);

    const { stdout: sliceOut } = await execFileAsync(process.execPath, [
      CLI_ENTRY,
      'skill',
      'slice',
      'database-orm-expert',
      '--json',
    ]);
    const sliceJson = JSON.parse(sliceOut);
    assert.equal(sliceJson.skill, 'database-orm-expert');
    assert.equal(sliceJson.domain, 'database-storage');

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'macli-guard-'));
    try {
      const cleanFile = path.join(tmpDir, 'clean.tsx');
      await writeFile(
        cleanFile,
        'export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <div>{id}</div>; }',
        'utf-8'
      );
      const { stdout: guardOut } = await execFileAsync(process.execPath, [
        CLI_ENTRY,
        'skill',
        'guard',
        cleanFile,
        '--skill',
        'nextjs-app-router-expert',
        '--json',
      ]);
      const guardJson = JSON.parse(guardOut);
      assert.equal(guardJson.passed, true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }

    const { stdout: repoOut } = await execFileAsync(process.execPath, [
      CLI_ENTRY,
      'repo',
      'topics',
      '--dry-run',
      '--json',
    ]);
    const repoTopics = JSON.parse(repoOut);
    assert.ok(Array.isArray(repoTopics));
    assert.ok(repoTopics.includes('agent-swarm'));
    assert.ok(repoTopics.includes('mcp'));
    assert.equal(repoTopics.length, 20);
  });
});

#!/usr/bin/env node

import { Command } from 'commander';
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ora from 'ora';
import pc from 'picocolors';
import prompts from 'prompts';
import { McpClientManager, McpServerConfig } from './core/mcpClient';
import {
  loadClaudeMcpConfig,
  loadGlobalSkills,
  loadSkills,
  loadVibesMcpConfig,
} from './core/skillLoader';
import { SwarmDirector } from './core/swarmDirector';
import {
  evaluateGuardRules,
  executeSkillAction,
  executeSkillChain,
  fetchSkillCompactSlice,
  getBlackboardState,
  getGuardRulesStats,
  getSkillSlicesMetadata,
  isVibesPluginInstalled,
  listSkillChainRecipes,
  loadNativeSubagentSpecs,
  resolveVibesPluginRoot,
} from './core/vibesBridge';
import type { ReasoningProfileId, Skill, SwarmTopology } from './types';

const VALID_TOPOLOGIES = new Set<SwarmTopology>([
  'fan_out_fan_in',
  'pipeline_saga',
  'critic_validator',
]);

const VALID_REASONING_PROFILES = new Set<ReasoningProfileId>([
  'speed',
  'balanced',
  'deep',
  'exhaustive',
]);

function writeOut(line: string): void {
  process.stdout.write(`${line}\n`);
}

function writeErr(line: string): void {
  process.stderr.write(`${line}\n`);
}

function parseJsonPayload(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON payload: ${msg}`);
  }
}

const program = new Command();

program
  .name('macli')
  .description('Enterprise Multi-Agent Swarm Orchestrator powered by vibes-plug v4.8.0')
  .version('2.0.0');

program
  .command('init')
  .description('Initialize macli API keys and verify vibes-plug v4.8.0 integration')
  .action(async () => {
    writeOut(pc.cyan(pc.bold('\nMacli v2.0.0 Initialization Setup\n')));

    const response = await prompts([
      {
        type: 'password',
        name: 'googleApiKey',
        message: 'Enter GOOGLE_API_KEY (leave empty to use Anthropic or deterministic mode):',
      },
      {
        type: 'password',
        name: 'anthropicApiKey',
        message: 'Enter ANTHROPIC_API_KEY (optional fallback/cascade):',
      },
    ]);

    const lines: string[] = [];
    if (typeof response.googleApiKey === 'string' && response.googleApiKey.trim().length > 0) {
      lines.push(`GOOGLE_API_KEY=${response.googleApiKey.trim()}`);
    }
    if (
      typeof response.anthropicApiKey === 'string' &&
      response.anthropicApiKey.trim().length > 0
    ) {
      lines.push(`ANTHROPIC_API_KEY=${response.anthropicApiKey.trim()}`);
    }

    if (lines.length > 0) {
      const envPath = path.join(process.cwd(), '.env');
      await writeFile(envPath, `${lines.join('\n')}\n`, 'utf-8');
      writeOut(pc.green(`Saved API configuration to ${envPath}`));
    } else {
      writeOut(pc.yellow('No API keys entered. macli will run in deterministic vibes-plug mode.'));
    }

    const pluginInstalled = await isVibesPluginInstalled();
    if (pluginInstalled) {
      const [slicesMeta, guardStats, subagents] = await Promise.all([
        getSkillSlicesMetadata(),
        getGuardRulesStats(),
        loadNativeSubagentSpecs(),
      ]);
      writeOut(
        pc.green(
          `Connected to vibes-plug at ${resolveVibesPluginRoot()} (${slicesMeta.totalSkills} skills, ${slicesMeta.totalCodeBlueprints} blueprints, ${guardStats.totalRulesCount} guard rules, ${subagents.length} specialists).`
        )
      );
    } else {
      writeOut(
        pc.yellow(
          `vibes-plug was not found at ${resolveVibesPluginRoot()}. Set VIBES_PLUG_ROOT to enable full SaaT & guardrail integration.`
        )
      );
    }
  });

program
  .command('run')
  .description('Run a task using the Swarm Director')
  .argument('<task>', 'The task to execute')
  .option('-t, --topology <topology>', 'Swarm topology: fan_out_fan_in | pipeline_saga | critic_validator')
  .option('-r, --reasoning <profile>', 'Reasoning profile: speed | balanced | deep | exhaustive')
  .option('--deterministic', 'Execute using deterministic vibes-plug SaaT engine without external LLM calls')
  .option('--json', 'Output machine-readable JSON result')
  .option('--with-vibes-mcp', 'Connect MCP servers declared in vibes-plug/mcp.json')
  .option('-d, --dir <path>', 'Directory containing local Antigravity SKILL.md files', process.cwd())
  .option('-c, --claude-config <path>', 'Path to claude_desktop_config.json')
  .option('--no-global', 'Disable loading global Antigravity skills from ~/.gemini/config')
  .option('--debug', 'Enable verbose diagnostic logging')
  .action(async (task: string, options) => {
    if (options.topology && !VALID_TOPOLOGIES.has(options.topology)) {
      writeErr(
        pc.red(
          `Invalid topology "${options.topology}". Allowed: ${Array.from(VALID_TOPOLOGIES).join(', ')}`
        )
      );
      process.exit(1);
    }
    if (options.reasoning && !VALID_REASONING_PROFILES.has(options.reasoning)) {
      writeErr(
        pc.red(
          `Invalid reasoning profile "${options.reasoning}". Allowed: ${Array.from(VALID_REASONING_PROFILES).join(', ')}`
        )
      );
      process.exit(1);
    }

    const silent = Boolean(options.json);
    if (!silent) {
      writeOut(pc.cyan(pc.bold('\nStarting macli Swarm v2.0.0...')));
      writeOut(`${pc.blue('Task:')} ${task}\n`);
    }

    const spinner = silent ? null : ora('Loading skills & micro-slices...').start();
    const mcpManager = new McpClientManager();

    try {
      const skills: Skill[] = [];

      const localSkills = await loadSkills(path.resolve(options.dir));
      skills.push(...localSkills);

      if (options.global !== false) {
        if (spinner) spinner.text = 'Loading global Antigravity & vibes-plug skills...';
        const globalSkills = await loadGlobalSkills();
        const existingIds = new Set(skills.map((s) => s.id));
        for (const gs of globalSkills) {
          if (!existingIds.has(gs.id)) {
            skills.push(gs);
          }
        }
      }

      const mcpServersToConnect: Record<string, McpServerConfig> = {};

      if (options.withVibesMcp) {
        Object.assign(mcpServersToConnect, await loadVibesMcpConfig());
      }

      let claudeConfigPath = options.claudeConfig;
      if (!claudeConfigPath) {
        const appData =
          process.env.APPDATA ||
          (process.platform === 'darwin'
            ? path.join(process.env.HOME || '', 'Library', 'Application Support')
            : '/var/local');
        claudeConfigPath = path.resolve(appData, 'Claude', 'claude_desktop_config.json');
      }

      const claudeMcpServers = await loadClaudeMcpConfig(claudeConfigPath);
      if (claudeMcpServers) {
        Object.assign(mcpServersToConnect, claudeMcpServers);
      }

      const serverEntries = Object.entries(mcpServersToConnect);
      if (serverEntries.length > 0) {
        if (spinner) spinner.text = `Connecting ${serverEntries.length} MCP server(s)...`;
        for (const [serverName, config] of serverEntries) {
          const client = await mcpManager.connectServer(serverName, config);
          if (client) {
            const mcpTools = await mcpManager.getTools(serverName);
            for (const tool of mcpTools) {
              skills.push({
                id: `mcp-${serverName}-${tool.name}`,
                name: tool.name,
                description: tool.description || `MCP Tool from ${serverName}`,
                source: 'mcp_server',
                mcpServerName: serverName,
                mcpToolArgsSchema: tool.inputSchema,
              });
            }
          }
        }
      }

      if (skills.length === 0) {
        spinner?.warn(pc.yellow('No skills discovered. Continuing with OS and vibes-plug tools.'));
      } else {
        spinner?.succeed(pc.green(`Loaded ${skills.length} skill(s) into Swarm Arsenal.`));
      }

      const director = new SwarmDirector(skills, mcpManager);
      const result = await director.executeTask(task, {
        debug: Boolean(options.debug),
        topology: options.topology,
        reasoning: options.reasoning,
        deterministic: Boolean(options.deterministic),
        json: silent,
      });

      await mcpManager.disconnectAll();

      if (silent) {
        writeOut(JSON.stringify(result, null, 2));
      }
      if (!result.success) {
        process.exitCode = 1;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      spinner?.fail(pc.red(`Failed running macli swarm: ${message}`));
      await mcpManager.disconnectAll();
      if (silent) {
        writeOut(JSON.stringify({ success: false, error: message }, null, 2));
      } else {
        writeErr(message);
      }
      process.exit(1);
    }
  });

const skillCmd = program
  .command('skill')
  .description('Execute vibes-plug Skill-as-a-Tool (SaaT) actions, chains, slices, and guardrails');

skillCmd
  .command('exec')
  .description('Execute a deterministic SaaT action on any of the 178 skills or "auto"')
  .argument('<skill>', 'Skill slug or "auto"')
  .argument('<action>', 'Action (audit, eval, verify, generate, fuzz, optimize, slice, blueprint, extract-code, rules, health, budget)')
  .option('-f, --file <path>', 'Target file path to evaluate')
  .option('-c, --code <snippet>', 'Inline code snippet to evaluate')
  .option('-p, --payload <json>', 'Additional JSON payload')
  .option('--json', 'Output JSON')
  .action(async (skill: string, action: string, options) => {
    try {
      const extraPayload = parseJsonPayload(options.payload);
      const payload: Record<string, unknown> = { ...extraPayload };
      if (options.file) payload.filePath = path.resolve(process.cwd(), options.file);
      if (options.code) payload.code = options.code;

      const response = await executeSkillAction({ skill, action, payload });
      if (options.json) {
        writeOut(JSON.stringify(response, null, 2));
      } else if (response.status === 'success') {
        writeOut(
          pc.green(
            `[${response.skill}:${response.action}] ${response.status} in ${response.durationMs}ms (tokens saved: ${response.telemetry?.tokensSaved ?? 0})`
          )
        );
        writeOut(JSON.stringify(response.result, null, 2));
      } else {
        writeErr(pc.red(`[${response.skill}:${response.action}] FAILED: ${response.error?.message}`));
      }

      if (response.status !== 'success') {
        process.exitCode = 1;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      writeErr(pc.red(msg));
      process.exit(1);
    }
  });

skillCmd
  .command('chain')
  .description('Execute an Autonomous Skill Composition Chain recipe')
  .argument('[recipe]', 'Recipe name (omit or pass "list" to inspect available recipes)')
  .option('-f, --file <path>', 'Target file path passed to all chain steps')
  .option('-p, --payload <json>', 'Shared JSON payload')
  .option('--json', 'Output JSON')
  .action(async (recipe: string | undefined, options) => {
    try {
      if (!recipe || recipe === 'list') {
        const recipes = await listSkillChainRecipes();
        if (options.json) {
          writeOut(JSON.stringify(recipes, null, 2));
        } else {
          writeOut(pc.cyan(pc.bold('\nAvailable Autonomous Skill Composition Chains:\n')));
          for (const [id, spec] of Object.entries(recipes)) {
            writeOut(`  ${pc.green(id)}: ${spec.name}`);
            writeOut(`    ${pc.gray(spec.description)}`);
          }
        }
        return;
      }

      const payload = parseJsonPayload(options.payload);
      if (options.file) {
        const resolved = path.resolve(process.cwd(), options.file);
        payload.filePath = resolved;
        payload.code = await readFile(resolved, 'utf-8');
      }

      const result = await executeSkillChain(recipe, payload);
      writeOut(JSON.stringify(result, null, 2));
      if (result.status !== 'success') {
        process.exitCode = 1;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      writeErr(pc.red(msg));
      process.exit(1);
    }
  });

skillCmd
  .command('slice')
  .description('Inspect the pre-compiled <350-token micro-slice for a skill')
  .argument('<skill>', 'Skill slug')
  .option('--json', 'Output JSON')
  .action(async (skill: string, options) => {
    const slice = await fetchSkillCompactSlice(skill);
    if (!slice) {
      const errObj = { status: 'failure', error: `Skill slice not found for "${skill}"` };
      writeOut(options.json ? JSON.stringify(errObj, null, 2) : pc.red(errObj.error));
      process.exit(1);
    }

    if (options.json) {
      writeOut(JSON.stringify(slice, null, 2));
      return;
    }

    writeOut(pc.cyan(pc.bold(`\n[${slice.skill}] v${slice.version} (${slice.domain})`)));
    writeOut(`Description      : ${slice.description}`);
    writeOut(`Supported Actions: ${slice.supportedActions.join(', ')}`);
    writeOut(`Guard Rules      : ${slice.guardRulesCount}`);
    writeOut(`Code Blueprints  : ${slice.codeBlueprintsCount}`);
    writeOut(`Connected Skills : ${(slice.connectedSkills || []).join(', ') || 'none'}`);
    writeOut(`NFR Contract     : ${slice.nfrContract}`);
  });

skillCmd
  .command('guard')
  .description('Evaluate 356+ deterministic AST/Regex guard rules against a file')
  .argument('<filePath>', 'Path to target file')
  .option('-s, --skill <skill>', 'Force evaluation for a specific skill slug')
  .option('--json', 'Output JSON')
  .action(async (filePath: string, options) => {
    try {
      const resolved = path.resolve(process.cwd(), filePath);
      const code = await readFile(resolved, 'utf-8');
      const report = await evaluateGuardRules({
        filePath: resolved,
        code,
        skill: options.skill,
      });

      if (options.json) {
        writeOut(JSON.stringify(report, null, 2));
      } else {
        writeOut(
          pc.cyan(
            `\n[Guard Audit] ${filePath} | Matched skills: ${report.matchedSkills.join(', ') || 'none'} | Rules evaluated: ${report.rulesEvaluated}`
          )
        );
        if (report.findingsCount === 0) {
          writeOut(pc.green('PASSED: 0 violations detected.'));
        } else {
          for (const finding of report.findings) {
            const colorFn = finding.severity === 'ERROR' ? pc.red : pc.yellow;
            writeOut(
              colorFn(
                `  [${finding.severity}] ${finding.ruleId} (${finding.skill}): ${finding.name}\n    Remediation: ${finding.remediation}`
              )
            );
          }
        }
      }

      if (!report.passed) {
        process.exitCode = 1;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      writeErr(pc.red(`Failed evaluating file: ${msg}`));
      process.exit(1);
    }
  });

program
  .command('agents')
  .description('List the 9 native vibes-plug specialist subagents and bound adapters')
  .option('--json', 'Output JSON')
  .action(async (options) => {
    const specs = await loadNativeSubagentSpecs();
    if (options.json) {
      writeOut(JSON.stringify(specs, null, 2));
      return;
    }

    writeOut(pc.cyan(pc.bold(`\nVibes-Plug Native Specialist Subagents (${specs.length}):\n`)));
    for (const spec of specs) {
      writeOut(`  ${pc.green(spec.id)} [${pc.yellow(spec.boundAdapter)}]`);
      writeOut(`    ${pc.gray(spec.role)}`);
    }
  });

program
  .command('doctor')
  .description('Verify macli v2.0.0 runtime and vibes-plug v4.8.0 ecosystem health')
  .option('--json', 'Output JSON')
  .action(async (options) => {
    const pluginRoot = resolveVibesPluginRoot();
    const pluginInstalled = await isVibesPluginInstalled();
    const [globalSkills, slicesMeta, guardStats, subagents, blackboard] = await Promise.all([
      loadGlobalSkills(),
      getSkillSlicesMetadata(),
      getGuardRulesStats(),
      loadNativeSubagentSpecs(),
      getBlackboardState(),
    ]);

    const report = {
      status: pluginInstalled && globalSkills.length >= 178 ? 'healthy' : 'degraded',
      macliVersion: '2.0.0',
      nodeVersion: process.version,
      vibesPluginRoot: pluginRoot,
      vibesPluginInstalled: pluginInstalled,
      skillsLoaded: globalSkills.length,
      slicesVersion: slicesMeta.version,
      slicesCount: slicesMeta.totalSkills,
      codeBlueprintsCount: slicesMeta.totalCodeBlueprints,
      guardedSkillsCount: guardStats.guardedSkillsCount,
      totalGuardRulesCount: guardStats.totalRulesCount,
      nativeSubagentsCount: subagents.length,
      autoSwarmActive: Boolean(blackboard.autoSwarm),
      llmKeysConfigured: {
        google: Boolean(process.env.GOOGLE_API_KEY),
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      },
    };

    if (options.json) {
      writeOut(JSON.stringify(report, null, 2));
      return;
    }

    writeOut(pc.cyan(pc.bold('\nMacli v2.0.0 + Vibes-Plug Diagnostic Report\n')));
    writeOut(`  Status               : ${report.status === 'healthy' ? pc.green('HEALTHY') : pc.yellow('DEGRADED')}`);
    writeOut(`  Vibes-Plug Root      : ${report.vibesPluginRoot}`);
    writeOut(`  Skills Loaded        : ${report.skillsLoaded}`);
    writeOut(`  Micro-Slices         : ${report.slicesCount} (${report.codeBlueprintsCount} blueprints)`);
    writeOut(`  Guard Rules Engine   : ${report.totalGuardRulesCount} rules across ${report.guardedSkillsCount} skills`);
    writeOut(`  Specialist Subagents : ${report.nativeSubagentsCount}`);
    writeOut(`  Auto-Swarm Mode      : ${report.autoSwarmActive ? 'ENABLED' : 'DISABLED'}`);
    writeOut(`  LLM Providers        : Google=${report.llmKeysConfigured.google}, Anthropic=${report.llmKeysConfigured.anthropic}`);
  });

program.parse();

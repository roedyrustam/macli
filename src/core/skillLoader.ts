import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Skill, SkillSlice } from '../types';
import type { McpServerConfig } from './mcpClient';
import { loadSkillSlicesMap, resolveVibesPluginRoot } from './vibesBridge';

export interface ParsedSkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  connectedSkills: string[];
}

const SKIP_SCAN_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Extracts YAML frontmatter metadata and orchestration graph edges from a SKILL.md document.
 */
export function parseSkillMarkdown(content: string, fallbackName: string): ParsedSkillMetadata {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmMatch ? fmMatch[1] : '';

  const nameMatch = fm.match(/^name:\s*([^\r\n]+)/m);
  const descMatch = fm.match(/^description:\s*([^\r\n]+)/m);
  const verMatch = fm.match(/^version:\s*([^\r\n]+)/m);
  const authorMatch = fm.match(/^author:\s*([^\r\n]+)/m);

  const name = nameMatch ? stripYamlQuotes(nameMatch[1]) : fallbackName;
  const description = descMatch
    ? stripYamlQuotes(descMatch[1])
    : 'Antigravity Skill loaded from SKILL.md';
  const version = verMatch ? stripYamlQuotes(verMatch[1]) : undefined;
  const author = authorMatch ? stripYamlQuotes(authorMatch[1]) : undefined;

  const orchMatch = content.match(
    /(?:##|###)\s*(?:Orchestration & Integration|Integrasi Orkestrasi)[\s\S]*?(?=\r?\n(?:##|###)\s|$)/i
  );
  const connectedSkills = orchMatch
    ? [
        ...new Set(
          Array.from(orchMatch[0].matchAll(/`([a-z0-9-]+)`/g))
            .map((m) => m[1])
            .filter((s) => s !== name && s !== fallbackName)
        ),
      ]
    : [];

  return {
    name,
    description,
    version,
    author,
    connectedSkills,
  };
}

function enrichSkillWithSlice(skill: Skill, sliceMap: Record<string, SkillSlice>): Skill {
  const slice = sliceMap[skill.name] || sliceMap[path.basename(skill.id.replace(/^antigravity-/, ''))];
  if (!slice) {
    return skill;
  }

  return {
    ...skill,
    version: skill.version || slice.version,
    domain: slice.domain,
    supportedActions: slice.supportedActions,
    guardRulesCount: slice.guardRulesCount,
    codeBlueprintsCount: slice.codeBlueprintsCount,
    connectedSkills:
      skill.connectedSkills && skill.connectedSkills.length > 0
        ? skill.connectedSkills
        : slice.connectedSkills || [],
    nfrContract: slice.nfrContract,
    slice,
  };
}

/**
 * Recursively loads local SKILL.md definitions and enriches them with vibes-plug micro-slices.
 */
export async function loadSkills(
  dirPath: string,
  preloadedSlices?: Record<string, SkillSlice>
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const sliceMap = preloadedSlices ?? (await loadSkillSlicesMap());

  try {
    const entries = await readdir(dirPath);

    for (const entry of entries) {
      if (SKIP_SCAN_DIRS.has(entry)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry);
      const fileStat = await stat(fullPath);

      if (fileStat.isDirectory()) {
        const subSkills = await loadSkills(fullPath, sliceMap);
        skills.push(...subSkills);
      } else if (entry === 'SKILL.md') {
        const content = await readFile(fullPath, 'utf-8');
        const folderName = path.basename(dirPath) || 'unknown-skill';
        const parsed = parseSkillMarkdown(content, folderName);
        const baseSkill: Skill = {
          id: `antigravity-${folderName}`,
          name: parsed.name || folderName,
          description: parsed.description,
          source: 'antigravity',
          content,
          version: parsed.version,
          author: parsed.author,
          connectedSkills: parsed.connectedSkills,
        };
        skills.push(enrichSkillWithSlice(baseSkill, sliceMap));
      }
    }
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      process.stderr.write(`Error loading skills from ${dirPath}: ${err.message}\n`);
    }
  }

  return skills;
}

/**
 * Loads global Antigravity skills across `~/.gemini/config` and `VIBES_PLUG_ROOT`.
 */
export async function loadGlobalSkills(): Promise<Skill[]> {
  const sliceMap = await loadSkillSlicesMap();
  const seenIds = new Set<string>();
  const globalSkills: Skill[] = [];

  const pushUnique = (items: Skill[]) => {
    for (const item of items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        globalSkills.push(item);
      }
    }
  };

  const pluginRoot = resolveVibesPluginRoot();
  const vibesSkills = await loadSkills(path.join(pluginRoot, 'skills'), sliceMap);
  pushUnique(vibesSkills);

  const configRoot = path.join(os.homedir(), '.gemini', 'config');
  const rootSkills = await loadSkills(path.join(configRoot, 'skills'), sliceMap);
  pushUnique(rootSkills);

  const pluginsDir = path.join(configRoot, 'plugins');
  try {
    const plugins = await readdir(pluginsDir);
    for (const plugin of plugins) {
      const pluginSkillsDir = path.join(pluginsDir, plugin, 'skills');
      if (path.resolve(pluginSkillsDir) === path.resolve(path.join(pluginRoot, 'skills'))) {
        continue;
      }
      const pluginSkills = await loadSkills(pluginSkillsDir, sliceMap);
      pushUnique(pluginSkills);
    }
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      process.stderr.write(`Error reading plugins dir: ${err.message}\n`);
    }
  }

  return globalSkills;
}

function expandPluginRootPlaceholder(value: string, pluginRoot: string): string {
  return value.replace(/\$\{PLUGIN_ROOT\}/g, pluginRoot);
}

/**
 * Loads MCP server declarations from `vibes-plug/mcp.json` and expands `${PLUGIN_ROOT}`.
 */
export async function loadVibesMcpConfig(): Promise<Record<string, McpServerConfig>> {
  const pluginRoot = resolveVibesPluginRoot();
  const mcpFilePath = path.join(pluginRoot, 'mcp.json');

  try {
    const content = await readFile(mcpFilePath, 'utf-8');
    const parsed = JSON.parse(content) as { mcpServers?: Record<string, McpServerConfig> };
    if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
      return {};
    }

    const expanded: Record<string, McpServerConfig> = {};
    for (const [serverName, rawConfig] of Object.entries(parsed.mcpServers)) {
      const envEntries = rawConfig.env
        ? Object.fromEntries(
            Object.entries(rawConfig.env).map(([k, v]) => [k, expandPluginRootPlaceholder(v, pluginRoot)])
          )
        : undefined;

      expanded[serverName] = {
        type: rawConfig.type,
        command: expandPluginRootPlaceholder(rawConfig.command, pluginRoot),
        args: Array.isArray(rawConfig.args)
          ? rawConfig.args.map((arg) => expandPluginRootPlaceholder(arg, pluginRoot))
          : [],
        cwd: rawConfig.cwd ? expandPluginRootPlaceholder(rawConfig.cwd, pluginRoot) : pluginRoot,
        env: envEntries,
      };
    }

    return expanded;
  } catch (err: unknown) {
    void err;
    return {};
  }
}

/**
 * Reads external MCP server configuration from a Claude Desktop config JSON file.
 */
export async function loadClaudeMcpConfig(
  configPath: string
): Promise<Record<string, McpServerConfig> | null> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as { mcpServers?: Record<string, McpServerConfig> };
    if (parsed.mcpServers) {
      return parsed.mcpServers;
    }
    return null;
  } catch (err: unknown) {
    void err;
    return null;
  }
}

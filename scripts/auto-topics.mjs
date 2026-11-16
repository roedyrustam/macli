#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// GitHub topic constraints:
// - Max 35 characters
// - Lowercase letters, numbers, and hyphens only
// - Must start and end with an alphanumeric character
// - Maximum 20 topics per repository
const GITHUB_TOPIC_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,33}[a-z0-9])?$/;
const MAX_TOPICS = 20;

/**
 * Curated domain dictionary mapping technology and architecture concepts
 * to canonical high-value GitHub repository topics.
 */
const DOMAIN_TOPIC_MAP = {
  // AI & Agent Architecture
  'agent': ['ai-agents', 'autonomous-agents', 'agent-swarm', 'multi-agent-systems'],
  'swarm': ['agent-swarm', 'multi-agent-systems', 'llm-orchestration'],
  'langgraph': ['langgraph', 'langchain', 'react-agent'],
  'langchain': ['langchain'],
  'mcp': ['mcp', 'model-context-protocol'],
  'gemini': ['google-gemini', 'gemini'],
  'claude': ['claude', 'anthropic'],
  'anthropic': ['claude', 'anthropic'],
  'antigravity': ['antigravity'],
  'vibes-plug': ['vibes-plug'],
  'guardrail': ['guardrails', 'anti-slop'],
  'coding': ['coding-agent', 'developer-tools'],
  'cli': ['cli', 'ai-cli'],
  'orchestrator': ['llm-orchestration', 'swarm-orchestrator'],
  'typescript': ['typescript', 'nodejs'],
  'saat': ['developer-tools'],
  'react-agent': ['react-agent'],
};

/**
 * Base high-priority seed topics for macli based on its core identity
 */
const SEED_TOPICS = [
  'agent-swarm',
  'ai-agents',
  'multi-agent-systems',
  'langgraph',
  'model-context-protocol',
  'mcp',
  'google-gemini',
  'claude',
  'antigravity',
  'vibes-plug',
  'autonomous-agents',
  'coding-agent',
  'llm-orchestration',
  'ai-cli',
  'cli',
  'developer-tools',
  'typescript',
  'nodejs',
  'langchain',
  'react-agent',
];

/**
 * Validate a topic string against GitHub's format specifications.
 */
function isValidTopic(topic) {
  if (typeof topic !== 'string') return false;
  const clean = topic.trim().toLowerCase();
  return clean.length >= 2 && clean.length <= 35 && GITHUB_TOPIC_REGEX.test(clean);
}

/**
 * Automatically analyze package.json, README.md, and project files to extract topics.
 */
async function extractProjectTopics() {
  const topicScores = new Map();

  function addTopic(topic, weight = 1) {
    const clean = topic.trim().toLowerCase();
    if (!isValidTopic(clean)) return;
    topicScores.set(clean, (topicScores.get(clean) || 0) + weight);
  }

  // 1. Seed topics get high base weight
  for (const [index, topic] of SEED_TOPICS.entries()) {
    addTopic(topic, 50 - index);
  }

  // 2. Inspect package.json
  try {
    const pkgRaw = await readFile(path.join(rootDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);

    if (Array.isArray(pkg.keywords)) {
      for (const kw of pkg.keywords) {
        addTopic(kw, 30);
      }
    }

    const pkgText = `${pkg.name || ''} ${pkg.description || ''}`.toLowerCase();
    for (const [key, mapped] of Object.entries(DOMAIN_TOPIC_MAP)) {
      if (pkgText.includes(key)) {
        for (const t of mapped) addTopic(t, 20);
      }
    }

    // Dependencies detection
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (allDeps['@langchain/langgraph']) addTopic('langgraph', 25);
    if (allDeps['@langchain/core']) addTopic('langchain', 20);
    if (allDeps['@langchain/google-genai']) addTopic('google-gemini', 25);
    if (allDeps['@langchain/anthropic']) addTopic('claude', 25);
    if (allDeps['@modelcontextprotocol/sdk']) {
      addTopic('mcp', 30);
      addTopic('model-context-protocol', 30);
    }
    if (allDeps['commander']) addTopic('cli', 20);
    if (allDeps['typescript']) addTopic('typescript', 20);
  } catch (err) {
    console.warn(`[WARN] Could not parse package.json: ${err.message}`);
  }

  // 3. Inspect README.md
  try {
    const readme = await readFile(path.join(rootDir, 'README.md'), 'utf-8');
    const lowerReadme = readme.toLowerCase();

    for (const [key, mapped] of Object.entries(DOMAIN_TOPIC_MAP)) {
      if (lowerReadme.includes(key)) {
        for (const t of mapped) addTopic(t, 15);
      }
    }

    if (lowerReadme.includes('guard rule') || lowerReadme.includes('ast/regex')) {
      addTopic('guardrails', 25);
    }
  } catch (err) {
    console.warn(`[WARN] Could not parse README.md: ${err.message}`);
  }

  // 4. Sort topics by score, deduplicate, and limit to MAX_TOPICS
  const sortedTopics = Array.from(topicScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);

  // Return exactly up to MAX_TOPICS valid unique topics
  const finalTopics = Array.from(new Set(sortedTopics)).slice(0, MAX_TOPICS);
  return finalTopics.sort();
}

/**
 * Get GitHub token from environment or local git credentials.
 */
function resolveGitHubToken() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }
  if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) {
    return process.env.GH_TOKEN.trim();
  }
  if (process.env.REPO_TOKEN && process.env.REPO_TOKEN.trim()) {
    return process.env.REPO_TOKEN.trim();
  }

  try {
    const output = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith('password=')) {
        return line.substring('password='.length).trim();
      }
    }
  } catch (err) {
    // Git credential helper not available or failed
  }

  return null;
}

/**
 * Detect repository owner and name from git remote origin or package.json.
 */
function resolveRepoInfo() {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch (err) {
    // fallback
  }

  return { owner: 'roedyrustam', repo: 'macli' };
}

/**
 * Main execution routine.
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isSync = args.includes('--sync') || !isDryRun;

  console.log('🤖 [macli] Automatic GitHub Repository Topics Generator & Optimizer');
  console.log('==================================================================');

  const topics = await extractProjectTopics();
  console.log(`\n✨ Generated ${topics.length} optimized topics:`);
  console.log(JSON.stringify(topics, null, 2));

  // Sync package.json keywords with the canonical topics
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkgRaw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw);

    const prevKeywords = JSON.stringify(pkg.keywords || []);
    const newKeywords = JSON.stringify(topics);

    if (prevKeywords !== newKeywords) {
      pkg.keywords = topics;
      await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
      console.log(`\n✔ Synchronized package.json keywords with canonical topics.`);
    } else {
      console.log(`\n✔ package.json keywords are already in sync.`);
    }
  } catch (err) {
    console.warn(`[WARN] Could not update package.json keywords: ${err.message}`);
  }

  if (isDryRun) {
    console.log('\n[Dry Run] Skipping GitHub API sync. Pass --sync or run without --dry-run to update GitHub.');
    return;
  }

  const token = resolveGitHubToken();
  const { owner, repo } = resolveRepoInfo();

  if (!token) {
    console.warn('\n⚠️ [NOTICE] No GitHub token found in env (GITHUB_TOKEN) or git credentials.');
    console.warn('  Topics were generated and updated in package.json.');
    console.warn('  To sync to GitHub, set GITHUB_TOKEN or authenticate git with GitHub CLI / PAT.');
    return;
  }

  console.log(`\n🚀 Synchronizing topics to GitHub repository: ${owner}/${repo}...`);

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/topics`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'macli-auto-topics-optimizer',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ names: topics }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 403 && process.env.GITHUB_ACTIONS) {
        console.warn(`\n⚠️ [GITHUB_ACTIONS_NOTE] GitHub API returned 403 (Resource not accessible by integration).`);
        console.warn(`👉 The default GITHUB_TOKEN in GitHub Actions cannot modify repository topics due to GitHub security policy.`);
        console.warn(`👉 To enable automated topics push directly from GitHub Actions, configure a repository secret named REPO_TOKEN with 'repo' scope.`);
        console.warn(`✔ Local CLI synchronization (macli repo topics) and package.json keywords remain fully operational.\n`);
        return;
      }
      console.error(`❌ GitHub API Error (${response.status}): ${errText}`);
      if (response.status === 403) {
        console.warn('👉 Note: Ensure the token has "repo" administration scope.');
      }
      process.exit(1);
    }

    const result = await response.json();
    console.log(`\n🎉 Successfully updated ${result.names?.length || topics.length} topics on GitHub!`);
    console.log(`URL: https://github.com/${owner}/${repo}`);
  } catch (err) {
    console.error(`❌ Network error while connecting to GitHub API: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});

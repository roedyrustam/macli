#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { loadSkills, loadClaudeMcpConfig } from './core/skillLoader';
import { SwarmDirector } from './core/swarmDirector';
import { McpClientManager } from './core/mcpClient';
import { Skill } from './types';
import 'dotenv/config';
import ora from 'ora';
import pc from 'picocolors';

const program = new Command();

program
  .name('macli')
  .description('AI Agent Swarm Orchestrator for Gemini/Antigravity and Claude')
  .version('1.0.0');

program
  .command('run')
  .description('Run a task using the Swarm')
  .argument('<task>', 'The task to execute')
  .option('-d, --dir <path>', 'Directory containing Antigravity SKILL.md files', process.cwd())
  .option('-c, --claude-config <path>', 'Path to claude_desktop_config.json')
  .action(async (task, options) => {
    console.log(pc.cyan(pc.bold('\n🚀 Starting macli Swarm...')));
    console.log(`${pc.blue('📋 Task:')} ${task}\n`);
    
    const spinner = ora('Memuat skills dari direktori lokal...').start();
    const mcpManager = new McpClientManager();
    
    try {
      const skillsDir = resolve(options.dir);
      const skills: Skill[] = await loadSkills(skillsDir);
      
      // Load Claude MCP
      let claudeConfigPath = options.claudeConfig;
      if (!claudeConfigPath) {
        const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
        claudeConfigPath = resolve(appData, 'Claude', 'claude_desktop_config.json');
      }

      const mcpServers = await loadClaudeMcpConfig(claudeConfigPath);
      
      if (mcpServers) {
        spinner.text = 'Menghubungkan ke Claude MCP Servers...';
        for (const [serverName, config] of Object.entries(mcpServers)) {
          const client = await mcpManager.connectServer(serverName, config);
          if (client) {
            const mcpTools = await mcpManager.getTools(serverName);
            for (const tool of mcpTools) {
              skills.push({
                id: `mcp-${serverName}-${tool.name}`,
                name: tool.name,
                description: tool.description || `MCP Tool dari ${serverName}`,
                source: 'mcp_server',
                mcpServerName: serverName,
                mcpToolArgsSchema: tool.inputSchema
              });
            }
          }
        }
      }

      if (skills.length === 0) {
        spinner.warn(pc.yellow('Tidak ada skill yang ditemukan. Melanjutkan dengan agen generik.'));
      } else {
        spinner.succeed(pc.green(`Berhasil memuat ${skills.length} skill(s) ke dalam Swarm Arsenal (termasuk MCP).`));
      }
      
      const director = new SwarmDirector(skills, mcpManager);
      await director.executeTask(task);
      
      await mcpManager.disconnectAll();
      
    } catch (error: any) {
      spinner.fail(pc.red('Gagal memulai macli.'));
      console.error(error.message);
      await mcpManager.disconnectAll();
      process.exit(1);
    }
  });

program.parse();

#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path_1 = require("path");
const skillLoader_1 = require("./core/skillLoader");
const swarmDirector_1 = require("./core/swarmDirector");
const mcpClient_1 = require("./core/mcpClient");
require("dotenv/config");
const ora_1 = __importDefault(require("ora"));
const picocolors_1 = __importDefault(require("picocolors"));
const program = new commander_1.Command();
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
    console.log(picocolors_1.default.cyan(picocolors_1.default.bold('\n🚀 Starting macli Swarm...')));
    console.log(`${picocolors_1.default.blue('📋 Task:')} ${task}\n`);
    const spinner = (0, ora_1.default)('Memuat skills dari direktori lokal...').start();
    const mcpManager = new mcpClient_1.McpClientManager();
    try {
        const skillsDir = (0, path_1.resolve)(options.dir);
        const skills = await (0, skillLoader_1.loadSkills)(skillsDir);
        // Load Claude MCP
        let claudeConfigPath = options.claudeConfig;
        if (!claudeConfigPath) {
            const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
            claudeConfigPath = (0, path_1.resolve)(appData, 'Claude', 'claude_desktop_config.json');
        }
        const mcpServers = await (0, skillLoader_1.loadClaudeMcpConfig)(claudeConfigPath);
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
            spinner.warn(picocolors_1.default.yellow('Tidak ada skill yang ditemukan. Melanjutkan dengan agen generik.'));
        }
        else {
            spinner.succeed(picocolors_1.default.green(`Berhasil memuat ${skills.length} skill(s) ke dalam Swarm Arsenal (termasuk MCP).`));
        }
        const director = new swarmDirector_1.SwarmDirector(skills, mcpManager);
        await director.executeTask(task);
        await mcpManager.disconnectAll();
    }
    catch (error) {
        spinner.fail(picocolors_1.default.red('Gagal memulai macli.'));
        console.error(error.message);
        await mcpManager.disconnectAll();
        process.exit(1);
    }
});
program.parse();

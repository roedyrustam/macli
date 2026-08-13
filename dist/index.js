#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const skillLoader_1 = require("./core/skillLoader");
const swarmDirector_1 = require("./core/swarmDirector");
const mcpClient_1 = require("./core/mcpClient");
require("dotenv/config");
const ora_1 = __importDefault(require("ora"));
const picocolors_1 = __importDefault(require("picocolors"));
const prompts_1 = __importDefault(require("prompts"));
const program = new commander_1.Command();
program
    .name('macli')
    .description('AI Agent Swarm Orchestrator for Gemini/Antigravity and Claude')
    .version('1.0.0');
program
    .command('init')
    .description('Inisialisasi macli dan atur konfigurasi API Key')
    .action(async () => {
    console.log(picocolors_1.default.cyan(picocolors_1.default.bold('\n⚙️  Macli Initialization Setup\n')));
    const response = await (0, prompts_1.default)({
        type: 'password',
        name: 'apiKey',
        message: 'Masukkan GOOGLE_API_KEY Anda (disembunyikan):',
        validate: value => value.length > 0 ? true : 'API Key tidak boleh kosong!'
    });
    if (!response.apiKey) {
        console.log(picocolors_1.default.red('Inisialisasi dibatalkan.'));
        return;
    }
    const envPath = (0, path_1.join)(process.cwd(), '.env');
    try {
        await (0, promises_1.writeFile)(envPath, `GOOGLE_API_KEY=${response.apiKey}\n`, 'utf-8');
        console.log(picocolors_1.default.green(`\n✔ Berhasil! API Key disimpan di ${envPath}`));
        console.log(picocolors_1.default.gray('Sekarang Anda bisa menjalankan: macli run "tugas Anda"'));
    }
    catch (e) {
        console.error(picocolors_1.default.red(`Gagal menulis file .env: ${e.message}`));
    }
});
program
    .command('run')
    .description('Run a task using the Swarm')
    .argument('<task>', 'The task to execute')
    .option('-d, --dir <path>', 'Directory containing Antigravity SKILL.md files', process.cwd())
    .option('-c, --claude-config <path>', 'Path to claude_desktop_config.json')
    .option('--no-global', 'Disable loading global Antigravity skills from ~/.gemini/config')
    .action(async (task, options) => {
    console.log(picocolors_1.default.cyan(picocolors_1.default.bold('\n🚀 Starting macli Swarm...')));
    console.log(`${picocolors_1.default.blue('📋 Task:')} ${task}\n`);
    const spinner = (0, ora_1.default)('Memuat skills...').start();
    const mcpManager = new mcpClient_1.McpClientManager();
    try {
        const skills = [];
        // Load local skills
        try {
            const skillsDir = (0, path_1.resolve)(options.dir);
            const localSkills = await (0, skillLoader_1.loadSkills)(skillsDir);
            skills.push(...localSkills);
        }
        catch (err) { }
        // Load global skills (unless disabled)
        if (options.global !== false) {
            spinner.text = 'Memuat Global Antigravity Skills (termasuk vibes-plug)...';
            const globalSkills = await (0, skillLoader_1.loadGlobalSkills)();
            skills.push(...globalSkills);
        }
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
            spinner.warn(picocolors_1.default.yellow('Tidak ada skill yang ditemukan. Melanjutkan dengan agen OS bawaan.'));
        }
        else {
            spinner.succeed(picocolors_1.default.green(`Berhasil memuat ${skills.length} skill eksternal ke dalam Swarm Arsenal.`));
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

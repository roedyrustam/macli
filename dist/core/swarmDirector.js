"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmDirector = void 0;
const google_genai_1 = require("@langchain/google-genai");
const tools_1 = require("@langchain/core/tools");
const messages_1 = require("@langchain/core/messages");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const langgraph_1 = require("@langchain/langgraph");
const osTools_1 = require("./tools/osTools");
const ora_1 = __importDefault(require("ora"));
const picocolors_1 = __importDefault(require("picocolors"));
class SwarmDirector {
    skills;
    llm;
    mcpManager;
    checkpointer;
    constructor(skills, mcpManager) {
        this.skills = skills;
        this.mcpManager = mcpManager;
        this.checkpointer = new langgraph_1.MemorySaver(); // In-memory persistent state for the swarm
        this.llm = new google_genai_1.ChatGoogleGenerativeAI({
            model: 'gemini-1.5-pro',
            temperature: 0,
            apiKey: process.env.GOOGLE_API_KEY || 'dummy_key',
        });
    }
    buildTools() {
        const aiTools = [];
        // 1. Tambahkan Built-in OS Tools (Bash, File Reader/Writer)
        aiTools.push(...(0, osTools_1.getOsTools)());
        // 2. Tambahkan Eksternal Skills (Antigravity & MCP)
        for (const skill of this.skills) {
            if (skill.source === 'mcp_server' && skill.mcpServerName) {
                aiTools.push(new tools_1.DynamicTool({
                    name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64),
                    description: skill.description || `Tool dari MCP ${skill.mcpServerName}`,
                    func: async (input) => {
                        console.log(picocolors_1.default.magenta(`\n[Agent -> MCP Claude] Menjalankan: ${skill.name}`));
                        try {
                            let parsedInput = {};
                            try {
                                parsedInput = JSON.parse(input);
                            }
                            catch (e) {
                                parsedInput = { input };
                            }
                            const result = await this.mcpManager.executeTool(skill.mcpServerName, skill.name, parsedInput);
                            return JSON.stringify(result.content || result);
                        }
                        catch (err) {
                            return `Gagal mengeksekusi MCP Tool: ${err.message}`;
                        }
                    },
                }));
            }
            else {
                aiTools.push(new tools_1.DynamicTool({
                    name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64) || 'default_tool',
                    description: skill.description || `Gunakan skill ini untuk: ${skill.name}`,
                    func: async (input) => {
                        console.log(picocolors_1.default.blue(`\n[Agent -> Antigravity] Menjalankan skill lokal: ${skill.name}`));
                        return `[HASIL DARI SKILL LOKAL ${skill.name.toUpperCase()}]: Berhasil mengeksekusi dengan parameter: ${input}`;
                    },
                }));
            }
        }
        return aiTools;
    }
    async executeTask(taskDescription) {
        if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'dummy_key') {
            console.log(picocolors_1.default.yellow('\n⚠️  WARNING: GOOGLE_API_KEY belum diatur di .env! LLM tidak bisa dipanggil, simulasi dihentikan.'));
            return;
        }
        const tools = this.buildTools();
        // Konfigurasi agen LangGraph (State Graph Multi-Agent System)
        const agent = (0, prebuilt_1.createReactAgent)({
            llm: this.llm,
            tools,
            checkpointSaver: this.checkpointer,
            messageModifier: 'Anda adalah "macli", sebuah Enterprise Swarm Agent. Anda memiliki akses ke eksekutor bash native, file system, tool lokal, dan Claude MCP server. Jalankan tugas secara mandiri. Jangan ragu memanggil tool. Analisa error dan perbaiki.'
        });
        console.log(picocolors_1.default.cyan('\n[SwarmDirector] LangGraph Network Aktif. Memulai eksekusi task...'));
        const config = { configurable: { thread_id: "macli-session-1" } };
        const spinner = (0, ora_1.default)(`Swarm AI sedang menganalisa dan bekerja...`).start();
        try {
            const stream = await agent.stream({
                messages: [new messages_1.HumanMessage(taskDescription)],
            }, config);
            for await (const chunk of stream) {
                if ("agent" in chunk) {
                    spinner.text = 'Swarm Agent (LLM) sedang berpikir...';
                }
                else if ("tools" in chunk) {
                    spinner.text = 'Swarm Agent sedang menggunakan Tool...';
                }
            }
            spinner.succeed(picocolors_1.default.green(picocolors_1.default.bold('\n✨ [SwarmDirector] Task selesai dieksekusi!')));
            // Ambil hasil akhir dari state graph
            const finalState = await agent.getState(config);
            const messages = finalState.values.messages;
            const lastMessage = messages[messages.length - 1];
            console.log(picocolors_1.default.white('============================================='));
            console.log(lastMessage.content);
            console.log(picocolors_1.default.white('=============================================\n'));
        }
        catch (error) {
            spinner.fail(picocolors_1.default.red(`Gagal mengeksekusi LangGraph Swarm.`));
            console.error(picocolors_1.default.red(error.message));
        }
    }
}
exports.SwarmDirector = SwarmDirector;

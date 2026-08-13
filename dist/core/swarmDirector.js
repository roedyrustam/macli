"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmDirector = void 0;
const google_genai_1 = require("@langchain/google-genai");
const tools_1 = require("@langchain/core/tools");
const messages_1 = require("@langchain/core/messages");
const ora_1 = __importDefault(require("ora"));
const picocolors_1 = __importDefault(require("picocolors"));
class SwarmDirector {
    skills;
    llm;
    constructor(skills) {
        this.skills = skills;
        this.llm = new google_genai_1.ChatGoogleGenerativeAI({
            model: 'gemini-1.5-pro',
            temperature: 0,
            apiKey: process.env.GOOGLE_API_KEY || 'dummy_key',
        });
    }
    buildTools() {
        return this.skills.map(skill => {
            return new tools_1.DynamicTool({
                name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64) || 'default_tool',
                description: skill.description || `Gunakan skill ini untuk: ${skill.name}`,
                func: async (input) => {
                    // Dummy execution simulation for the skill
                    return `[HASIL DARI SKILL ${skill.name.toUpperCase()}]: Berhasil mengeksekusi aksi dengan parameter: ${input}`;
                },
            });
        });
    }
    async executeTask(taskDescription) {
        if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'dummy_key') {
            console.log(picocolors_1.default.yellow('\n⚠️  WARNING: GOOGLE_API_KEY belum diatur di .env! LLM tidak bisa dipanggil, simulasi dihentikan.'));
            return;
        }
        const tools = this.buildTools();
        const llmWithTools = tools.length > 0 ? this.llm.bindTools(tools) : this.llm;
        const messages = [
            new messages_1.SystemMessage('Anda adalah "macli", seorang Swarm Director tingkat lanjut. Pecah tugas pengguna dan gunakan alat (tools) yang tersedia untuk menyelesaikannya. Berikan jawaban komprehensif dalam bahasa Indonesia.'),
            new messages_1.HumanMessage(taskDescription)
        ];
        let isDone = false;
        let step = 1;
        console.log(picocolors_1.default.cyan('\n[SwarmDirector] Memulai ReAct Loop...'));
        while (!isDone && step < 10) { // Max 10 steps to prevent infinite loop
            const spinner = (0, ora_1.default)(`[Step ${step}] Swarm AI sedang berpikir...`).start();
            try {
                const response = await llmWithTools.invoke(messages);
                messages.push(response);
                spinner.stop();
                if (response.tool_calls && response.tool_calls.length > 0) {
                    console.log(picocolors_1.default.magenta(`\n🔧 [Agent Memanggil Tool]`));
                    for (const toolCall of response.tool_calls) {
                        console.log(`   ${picocolors_1.default.bold('Tool:')} ${toolCall.name}`);
                        console.log(`   ${picocolors_1.default.bold('Input:')} ${JSON.stringify(toolCall.args)}`);
                        const spinnerTool = (0, ora_1.default)(`Mengeksekusi ${toolCall.name}...`).start();
                        // Cari tool dan jalankan
                        const matchedTool = tools.find(t => t.name === toolCall.name);
                        let toolResultStr = "Tool tidak ditemukan";
                        if (matchedTool) {
                            // Langchain DynamicTool takes a single string by default in its simple func mapping
                            const inputArg = typeof toolCall.args === 'string' ? toolCall.args : JSON.stringify(toolCall.args);
                            toolResultStr = await matchedTool.invoke(inputArg);
                        }
                        spinnerTool.succeed(`Selesai mengeksekusi ${toolCall.name}`);
                        console.log(picocolors_1.default.dim(`   > ${toolResultStr}\n`));
                        // Masukkan hasil kembali ke conversation history
                        messages.push(new messages_1.ToolMessage({
                            tool_call_id: toolCall.id,
                            name: toolCall.name,
                            content: toolResultStr
                        }));
                    }
                    step++;
                }
                else {
                    isDone = true;
                    console.log(picocolors_1.default.green(picocolors_1.default.bold('\n✨ [SwarmDirector] Tugas Selesai!')));
                    console.log(picocolors_1.default.white('============================================='));
                    console.log(response.content);
                    console.log(picocolors_1.default.white('=============================================\n'));
                }
            }
            catch (error) {
                spinner.fail(picocolors_1.default.red(`Gagal pada langkah ${step}`));
                console.error(picocolors_1.default.red(error.message));
                break;
            }
        }
    }
}
exports.SwarmDirector = SwarmDirector;

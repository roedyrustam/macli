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
const zod_1 = require("zod");
const osTools_1 = require("./tools/osTools");
const ora_1 = __importDefault(require("ora"));
const picocolors_1 = __importDefault(require("picocolors"));
// 1. Definisikan State untuk Graph Multi-Agent
const AgentState = langgraph_1.Annotation.Root({
    messages: (0, langgraph_1.Annotation)({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    next: (0, langgraph_1.Annotation)({
        reducer: (x, y) => y ?? x,
        default: () => "Supervisor",
    })
});
class SwarmDirector {
    skills;
    llm;
    mcpManager;
    checkpointer;
    constructor(skills, mcpManager) {
        this.skills = skills;
        this.mcpManager = mcpManager;
        this.checkpointer = new langgraph_1.MemorySaver();
        this.llm = new google_genai_1.ChatGoogleGenerativeAI({
            model: 'gemini-1.5-pro',
            temperature: 0,
            apiKey: process.env.GOOGLE_API_KEY || 'dummy_key',
        });
    }
    buildResearcherTools() {
        const aiTools = [];
        for (const skill of this.skills) {
            if (skill.source === 'mcp_server' && skill.mcpServerName) {
                aiTools.push(new tools_1.DynamicTool({
                    name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64),
                    description: skill.description || `Tool dari MCP ${skill.mcpServerName}`,
                    func: async (input) => {
                        console.log(picocolors_1.default.magenta(`\n[Researcher -> MCP Claude] Menjalankan: ${skill.name}`));
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
                aiTools.push(new tools_1.DynamicStructuredTool({
                    name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64) || 'default_tool',
                    description: skill.description || `Gunakan skill ini untuk: ${skill.name}.`,
                    schema: zod_1.z.object({
                        intent: zod_1.z.string().describe("Niat atau tujuan pemanggilan"),
                        parameters: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
                    }),
                    func: async ({ intent, parameters }) => {
                        console.log(picocolors_1.default.blue(`\n[Researcher -> Antigravity] Menjalankan skill: ${skill.name}`));
                        return `[HASIL LOKAL]: Eksekusi intent "${intent}" parameter: ${JSON.stringify(parameters || {})}`;
                    },
                }));
            }
        }
        return aiTools;
    }
    async executeTask(taskDescription, debug = false) {
        if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'dummy_key') {
            console.log(picocolors_1.default.yellow('\n⚠️  WARNING: GOOGLE_API_KEY belum diatur di .env! LLM tidak bisa dipanggil, simulasi dihentikan.'));
            return;
        }
        // 2. Buat Agen Spesialis (Sub-Agents)
        const coderTools = (0, osTools_1.getOsTools)();
        const coderAgent = (0, prebuilt_1.createReactAgent)({
            llm: this.llm,
            tools: coderTools,
            messageModifier: 'Anda adalah CoderAgent. Anda ahli dalam menulis kode, membaca file, dan menjalankan bash.'
        });
        const researcherTools = this.buildResearcherTools();
        const researcherAgent = researcherTools.length > 0 ? (0, prebuilt_1.createReactAgent)({
            llm: this.llm,
            tools: researcherTools,
            messageModifier: 'Anda adalah ResearcherAgent. Anda ahli dalam mencari informasi, menggunakan Claude MCP Tools, dan skill lokal.'
        }) : null;
        // Helper untuk menjalankan sub-agent dan mengembalikan state
        const runAgent = async (agent, name, state) => {
            if (debug)
                console.log(picocolors_1.default.yellow(`[DEBUG] Executing ${name} with ${state.messages.length} messages`));
            const result = await agent.invoke(state);
            const lastMessage = result.messages[result.messages.length - 1];
            if (debug)
                console.log(picocolors_1.default.yellow(`[DEBUG] ${name} Output: ${lastMessage.content}`));
            return {
                messages: [new messages_1.HumanMessage({ content: `${name} selesai dengan output: ${lastMessage.content}`, name })]
            };
        };
        // 3. Buat Node Supervisor
        const routingSchema = zod_1.z.object({
            next: zod_1.z.enum(["CoderAgent", "ResearcherAgent", "FINISH"]).describe("Agen mana yang harus ditugaskan selanjutnya, atau FINISH jika tugas selesai.")
        });
        // Fallback jika tidak ada researcher tools
        const availableOptions = researcherTools.length > 0 ? "CoderAgent, ResearcherAgent, atau FINISH" : "CoderAgent, atau FINISH";
        const supervisorPrompt = `Anda adalah Supervisor. Tugas Anda adalah mengelola eksekusi tugas pengguna.
Pecah tugas dan delegasikan ke pekerja berikut berdasarkan keahlian mereka:
- CoderAgent: untuk operasi terminal, baca/tulis file, dan koding.
${researcherTools.length > 0 ? '- ResearcherAgent: untuk memanggil API eksternal, Claude MCP, atau skill lokal.' : ''}
Berdasarkan pesan sebelumnya, pilih pekerja selanjutnya atau FINISH jika tugas keseluruhan selesai. Options: ${availableOptions}`;
        const supervisorChain = this.llm.withStructuredOutput(routingSchema);
        const supervisorNode = async (state) => {
            const messages = [new messages_1.SystemMessage(supervisorPrompt), ...state.messages];
            const result = await supervisorChain.invoke(messages);
            if (debug)
                console.log(picocolors_1.default.yellow(`[DEBUG] Supervisor Decision: -> ${result.next}`));
            return { next: result.next };
        };
        // 4. Rakit Graph
        const workflow = new langgraph_1.StateGraph(AgentState)
            .addNode("Supervisor", supervisorNode)
            .addNode("CoderAgent", (state) => runAgent(coderAgent, "CoderAgent", state));
        if (researcherTools.length > 0) {
            workflow.addNode("ResearcherAgent", (state) => runAgent(researcherAgent, "ResearcherAgent", state));
            workflow.addEdge("ResearcherAgent", "Supervisor");
            workflow.addConditionalEdges("Supervisor", (state) => state.next, {
                "CoderAgent": "CoderAgent",
                "ResearcherAgent": "ResearcherAgent",
                "FINISH": langgraph_1.END,
            });
        }
        else {
            workflow.addConditionalEdges("Supervisor", (state) => state.next, {
                "CoderAgent": "CoderAgent",
                "FINISH": langgraph_1.END,
            });
        }
        workflow.addEdge("CoderAgent", "Supervisor");
        workflow.addEdge(langgraph_1.START, "Supervisor");
        const app = workflow.compile({ checkpointer: this.checkpointer });
        console.log(picocolors_1.default.cyan('\n[SwarmDirector] Supervisor Multi-Agent Network Aktif...'));
        const config = { configurable: { thread_id: "macli-session-multi-agent" } };
        const spinner = (0, ora_1.default)(`Supervisor AI sedang mengatur strategi...`).start();
        try {
            const stream = await app.stream({
                messages: [new messages_1.HumanMessage(taskDescription)],
            }, config);
            for await (const chunk of stream) {
                if (chunk.Supervisor) {
                    spinner.text = `[Supervisor] mendelegasikan tugas ke -> ${chunk.Supervisor.next}`;
                }
                else if (chunk.CoderAgent) {
                    spinner.text = `[CoderAgent] sedang bekerja di OS...`;
                }
                else if (chunk.ResearcherAgent) {
                    spinner.text = `[ResearcherAgent] sedang bekerja dengan skill/MCP...`;
                }
            }
            spinner.succeed(picocolors_1.default.green(picocolors_1.default.bold('\n✨ [SwarmDirector] Seluruh Tugas Selesai!')));
            const finalState = await app.getState(config);
            const msgs = finalState.values.messages;
            const lastMsg = msgs[msgs.length - 1];
            console.log(picocolors_1.default.white('============================================='));
            console.log(lastMsg.content);
            console.log(picocolors_1.default.white('=============================================\n'));
        }
        catch (error) {
            spinner.fail(picocolors_1.default.red(`Gagal mengeksekusi LangGraph Swarm.`));
            console.error(picocolors_1.default.red(error.message));
        }
    }
}
exports.SwarmDirector = SwarmDirector;

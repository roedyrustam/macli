"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmDirector = void 0;
const google_genai_1 = require("@langchain/google-genai");
const tools_1 = require("@langchain/core/tools");
const messages_1 = require("@langchain/core/messages");
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
                description: skill.description || `Tool for ${skill.name}`,
                func: async (input) => {
                    console.log(`\n[Agent -> Skill] Using skill: ${skill.name}`);
                    return `Executed skill ${skill.name}`;
                },
            });
        });
    }
    async executeTask(taskDescription) {
        console.log(`[SwarmDirector] Analyzing task: "${taskDescription}"`);
        console.log(`[SwarmDirector] Loaded ${this.skills.length} skills into Swarm Arsenal.`);
        if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'dummy_key') {
            console.warn('[SwarmDirector] WARNING: GOOGLE_API_KEY is not set. Execution simulated.');
            return;
        }
        const tools = this.buildTools();
        // Bind tools to the LLM
        const llmWithTools = tools.length > 0 ? this.llm.bindTools(tools) : this.llm;
        console.log('[SwarmDirector] Starting orchestration loop...');
        try {
            const response = await llmWithTools.invoke([
                new messages_1.SystemMessage('You are the macli Swarm Director. Fulfill the user task by using available tools.'),
                new messages_1.HumanMessage(taskDescription)
            ]);
            console.log('\n=============================================');
            console.log('🤖 [SwarmDirector] Final Result:');
            console.log('=============================================');
            console.log(response.content || "Tool calls requested:");
            if (response.tool_calls && response.tool_calls.length > 0) {
                console.log(response.tool_calls);
            }
        }
        catch (error) {
            console.error('\n❌ [SwarmDirector] Execution failed:', error.message);
        }
    }
}
exports.SwarmDirector = SwarmDirector;

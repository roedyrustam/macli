import { Skill } from '../types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicTool } from '@langchain/core/tools';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

export class SwarmDirector {
  private skills: Skill[];
  private llm: ChatGoogleGenerativeAI;

  constructor(skills: Skill[]) {
    this.skills = skills;
    
    this.llm = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-pro',
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY || 'dummy_key',
    });
  }

  private buildTools(): DynamicTool[] {
    return this.skills.map(skill => {
      return new DynamicTool({
        name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64) || 'default_tool',
        description: skill.description || `Tool for ${skill.name}`,
        func: async (input: string) => {
          console.log(`\n[Agent -> Skill] Using skill: ${skill.name}`);
          return `Executed skill ${skill.name}`;
        },
      });
    });
  }

  public async executeTask(taskDescription: string): Promise<void> {
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
        new SystemMessage('You are the macli Swarm Director. Fulfill the user task by using available tools.'),
        new HumanMessage(taskDescription)
      ]);

      console.log('\n=============================================');
      console.log('🤖 [SwarmDirector] Final Result:');
      console.log('=============================================');
      console.log(response.content || "Tool calls requested:");
      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log(response.tool_calls);
      }
    } catch (error: any) {
      console.error('\n❌ [SwarmDirector] Execution failed:', error.message);
    }
  }
}

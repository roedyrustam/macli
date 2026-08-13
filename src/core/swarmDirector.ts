import { Skill } from '../types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool, DynamicTool } from '@langchain/core/tools';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver, StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import { McpClientManager } from './mcpClient';
import { getOsTools } from './tools/osTools';
import ora from 'ora';
import pc from 'picocolors';

// 1. Definisikan State untuk Graph Multi-Agent
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "Supervisor",
  })
});

export class SwarmDirector {
  private skills: Skill[];
  private llm: ChatGoogleGenerativeAI;
  private mcpManager: McpClientManager;
  private checkpointer: MemorySaver;

  constructor(skills: Skill[], mcpManager: McpClientManager) {
    this.skills = skills;
    this.mcpManager = mcpManager;
    this.checkpointer = new MemorySaver();
    this.llm = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-pro',
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY || 'dummy_key',
    });
  }

  private buildResearcherTools(): any[] {
    const aiTools: any[] = [];
    for (const skill of this.skills) {
      if (skill.source === 'mcp_server' && skill.mcpServerName) {
        aiTools.push(new DynamicTool({
          name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64),
          description: skill.description || `Tool dari MCP ${skill.mcpServerName}`,
          func: async (input: string) => {
            console.log(pc.magenta(`\n[Researcher -> MCP Claude] Menjalankan: ${skill.name}`));
            try {
              let parsedInput = {};
              try { parsedInput = JSON.parse(input); } catch (e) { parsedInput = { input }; }
              const result: any = await this.mcpManager.executeTool(skill.mcpServerName!, skill.name, parsedInput);
              return JSON.stringify(result.content || result);
            } catch (err: any) {
              return `Gagal mengeksekusi MCP Tool: ${err.message}`;
            }
          },
        }));
      } else {
        aiTools.push(new DynamicStructuredTool({
          name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64) || 'default_tool',
          description: skill.description || `Gunakan skill ini untuk: ${skill.name}.`,
          schema: z.object({
            intent: z.string().describe("Niat atau tujuan pemanggilan"),
            parameters: z.record(z.string(), z.any()).optional(),
          }),
          func: async ({ intent, parameters }) => {
            console.log(pc.blue(`\n[Researcher -> Antigravity] Menjalankan skill: ${skill.name}`));
            return `[HASIL LOKAL]: Eksekusi intent "${intent}" parameter: ${JSON.stringify(parameters || {})}`;
          },
        }));
      }
    }
    return aiTools;
  }

  public async executeTask(taskDescription: string): Promise<void> {
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'dummy_key') {
      console.log(pc.yellow('\n⚠️  WARNING: GOOGLE_API_KEY belum diatur di .env! LLM tidak bisa dipanggil, simulasi dihentikan.'));
      return;
    }

    // 2. Buat Agen Spesialis (Sub-Agents)
    const coderTools = getOsTools();
    const coderAgent = createReactAgent({
      llm: this.llm,
      tools: coderTools,
      messageModifier: 'Anda adalah CoderAgent. Anda ahli dalam menulis kode, membaca file, dan menjalankan bash.'
    });

    const researcherTools = this.buildResearcherTools();
    const researcherAgent = researcherTools.length > 0 ? createReactAgent({
      llm: this.llm,
      tools: researcherTools,
      messageModifier: 'Anda adalah ResearcherAgent. Anda ahli dalam mencari informasi, menggunakan Claude MCP Tools, dan skill lokal.'
    }) : null;

    // Helper untuk menjalankan sub-agent dan mengembalikan state
    const runAgent = async (agent: any, name: string, state: typeof AgentState.State) => {
      const result = await agent.invoke(state);
      const lastMessage = result.messages[result.messages.length - 1];
      return {
        messages: [new HumanMessage({ content: `${name} selesai dengan output: ${lastMessage.content}`, name })]
      };
    };

    // 3. Buat Node Supervisor
    const routingSchema = z.object({
      next: z.enum(["CoderAgent", "ResearcherAgent", "FINISH"]).describe("Agen mana yang harus ditugaskan selanjutnya, atau FINISH jika tugas selesai.")
    });
    
    // Fallback jika tidak ada researcher tools
    const availableOptions = researcherTools.length > 0 ? "CoderAgent, ResearcherAgent, atau FINISH" : "CoderAgent, atau FINISH";
    const supervisorPrompt = `Anda adalah Supervisor. Tugas Anda adalah mengelola eksekusi tugas pengguna.
Pecah tugas dan delegasikan ke pekerja berikut berdasarkan keahlian mereka:
- CoderAgent: untuk operasi terminal, baca/tulis file, dan koding.
${researcherTools.length > 0 ? '- ResearcherAgent: untuk memanggil API eksternal, Claude MCP, atau skill lokal.' : ''}
Berdasarkan pesan sebelumnya, pilih pekerja selanjutnya atau FINISH jika tugas keseluruhan selesai. Options: ${availableOptions}`;

    const supervisorChain = this.llm.withStructuredOutput(routingSchema);
    
    const supervisorNode = async (state: typeof AgentState.State) => {
      const messages = [new SystemMessage(supervisorPrompt), ...state.messages];
      const result = await supervisorChain.invoke(messages);
      return { next: result.next };
    };

    // 4. Rakit Graph
    const workflow: any = new StateGraph(AgentState)
      .addNode("Supervisor", supervisorNode)
      .addNode("CoderAgent", (state: any) => runAgent(coderAgent, "CoderAgent", state));

    if (researcherTools.length > 0) {
      workflow.addNode("ResearcherAgent", (state: any) => runAgent(researcherAgent, "ResearcherAgent", state));
      workflow.addEdge("ResearcherAgent", "Supervisor");
      workflow.addConditionalEdges("Supervisor", (state: any) => state.next, {
        "CoderAgent": "CoderAgent",
        "ResearcherAgent": "ResearcherAgent",
        "FINISH": END,
      });
    } else {
      workflow.addConditionalEdges("Supervisor", (state: any) => state.next, {
        "CoderAgent": "CoderAgent",
        "FINISH": END,
      });
    }

    workflow.addEdge("CoderAgent", "Supervisor");
    workflow.addEdge(START, "Supervisor");

    const app = workflow.compile({ checkpointer: this.checkpointer });

    console.log(pc.cyan('\n[SwarmDirector] Supervisor Multi-Agent Network Aktif...'));
    const config = { configurable: { thread_id: "macli-session-multi-agent" } };
    const spinner = ora(`Supervisor AI sedang mengatur strategi...`).start();

    try {
      const stream = await app.stream({
        messages: [new HumanMessage(taskDescription)],
      }, config);

      for await (const chunk of stream as any) {
        if (chunk.Supervisor) {
          spinner.text = `[Supervisor] mendelegasikan tugas ke -> ${chunk.Supervisor.next}`;
        } else if (chunk.CoderAgent) {
          spinner.text = `[CoderAgent] sedang bekerja di OS...`;
        } else if (chunk.ResearcherAgent) {
          spinner.text = `[ResearcherAgent] sedang bekerja dengan skill/MCP...`;
        }
      }

      spinner.succeed(pc.green(pc.bold('\n✨ [SwarmDirector] Seluruh Tugas Selesai!')));
      
      const finalState = await app.getState(config);
      const msgs = finalState.values.messages;
      const lastMsg = msgs[msgs.length - 1];
      
      console.log(pc.white('============================================='));
      console.log(lastMsg.content);
      console.log(pc.white('=============================================\n'));

    } catch (error: any) {
      spinner.fail(pc.red(`Gagal mengeksekusi LangGraph Swarm.`));
      console.error(pc.red(error.message));
    }
  }
}

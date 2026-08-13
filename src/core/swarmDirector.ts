import { Skill } from '../types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { z } from 'zod';
import { McpClientManager } from './mcpClient';
import { getOsTools } from './tools/osTools';
import ora from 'ora';
import pc from 'picocolors';

export class SwarmDirector {
  private skills: Skill[];
  private llm: ChatGoogleGenerativeAI;
  private mcpManager: McpClientManager;
  private checkpointer: MemorySaver;

  constructor(skills: Skill[], mcpManager: McpClientManager) {
    this.skills = skills;
    this.mcpManager = mcpManager;
    this.checkpointer = new MemorySaver(); // In-memory persistent state for the swarm
    this.llm = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-pro',
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY || 'dummy_key',
    });
  }

  private buildTools(): any[] {
    const aiTools: any[] = [];
    
    // 1. Tambahkan Built-in OS Tools (Bash, File Reader/Writer)
    aiTools.push(...getOsTools());

    // 2. Tambahkan Eksternal Skills (Antigravity & MCP)
    for (const skill of this.skills) {
      if (skill.source === 'mcp_server' && skill.mcpServerName) {
        aiTools.push(new DynamicTool({
          name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64),
          description: skill.description || `Tool dari MCP ${skill.mcpServerName}`,
          func: async (input: string) => {
            console.log(pc.magenta(`\n[Agent -> MCP Claude] Menjalankan: ${skill.name}`));
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
          description: skill.description || `Gunakan skill ini untuk: ${skill.name}. Panduan lengkap skill ini bisa diakses jika diperlukan.`,
          schema: z.object({
            intent: z.string().describe("Niat atau tujuan spesifik pemanggilan skill ini"),
            parameters: z.record(z.string(), z.any()).optional().describe("Parameter terstruktur tambahan (JSON-like) jika diperlukan oleh skill"),
          }),
          func: async ({ intent, parameters }) => {
            console.log(pc.blue(`\n[Agent -> Antigravity] Menjalankan skill lokal: ${skill.name}`));
            return `[HASIL SKILL LOKAL ${skill.name.toUpperCase()}]: Berhasil mengeksekusi intent "${intent}" dengan parameter: ${JSON.stringify(parameters || {})}`;
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

    const tools = this.buildTools();
    
    // Konfigurasi agen LangGraph (State Graph Multi-Agent System)
    const agent = createReactAgent({
      llm: this.llm,
      tools,
      checkpointSaver: this.checkpointer,
      messageModifier: 'Anda adalah "macli", sebuah Enterprise Swarm Agent. Anda memiliki akses ke eksekutor bash native, file system, tool lokal, dan Claude MCP server. Jalankan tugas secara mandiri. Jangan ragu memanggil tool. Analisa error dan perbaiki.'
    });

    console.log(pc.cyan('\n[SwarmDirector] LangGraph Network Aktif. Memulai eksekusi task...'));
    
    const config = { configurable: { thread_id: "macli-session-1" } };
    const spinner = ora(`Swarm AI sedang menganalisa dan bekerja...`).start();

    try {
      const stream = await agent.stream({
        messages: [new HumanMessage(taskDescription)],
      }, config);

      for await (const chunk of stream) {
        if ("agent" in chunk) {
            spinner.text = 'Swarm Agent (LLM) sedang berpikir...';
        } else if ("tools" in chunk) {
            spinner.text = 'Swarm Agent sedang menggunakan Tool...';
        }
      }

      spinner.succeed(pc.green(pc.bold('\n✨ [SwarmDirector] Task selesai dieksekusi!')));
      
      // Ambil hasil akhir dari state graph
      const finalState = await agent.getState(config);
      const messages = finalState.values.messages;
      const lastMessage = messages[messages.length - 1];
      
      console.log(pc.white('============================================='));
      console.log(lastMessage.content);
      console.log(pc.white('=============================================\n'));

    } catch (error: any) {
      spinner.fail(pc.red(`Gagal mengeksekusi LangGraph Swarm.`));
      console.error(pc.red(error.message));
    }
  }
}

import { Skill } from '../types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { SystemMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { McpClientManager } from './mcpClient';
import ora from 'ora';
import pc from 'picocolors';
import { z } from 'zod';

export class SwarmDirector {
  private skills: Skill[];
  private llm: ChatGoogleGenerativeAI;
  private mcpManager: McpClientManager;

  constructor(skills: Skill[], mcpManager: McpClientManager) {
    this.skills = skills;
    this.mcpManager = mcpManager;
    this.llm = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-pro',
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY || 'dummy_key',
    });
  }

  private buildTools(): any[] {
    return this.skills.map(skill => {
      // Create a more precise tool for MCP tools
      if (skill.source === 'mcp_server' && skill.mcpServerName) {
        return new DynamicTool({
          name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64),
          description: skill.description || `Tool dari MCP ${skill.mcpServerName}`,
          func: async (input: string) => {
            console.log(`\n[Agent -> MCP Claude] Menjalankan: ${skill.name}`);
            try {
              let parsedInput = {};
              try { parsedInput = JSON.parse(input); } catch (e) { parsedInput = { input }; }
              const result: any = await this.mcpManager.executeTool(skill.mcpServerName!, skill.name, parsedInput);
              return JSON.stringify(result.content || result);
            } catch (err: any) {
              return `Gagal mengeksekusi MCP Tool: ${err.message}`;
            }
          },
        });
      }

      // Default for Antigravity skills
      return new DynamicTool({
        name: skill.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64) || 'default_tool',
        description: skill.description || `Gunakan skill ini untuk: ${skill.name}`,
        func: async (input: string) => {
          return `[HASIL DARI SKILL LOKAL ${skill.name.toUpperCase()}]: Berhasil mengeksekusi dengan parameter: ${input}`;
        },
      });
    });
  }

  public async executeTask(taskDescription: string): Promise<void> {
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'dummy_key') {
      console.log(pc.yellow('\n⚠️  WARNING: GOOGLE_API_KEY belum diatur di .env! LLM tidak bisa dipanggil, simulasi dihentikan.'));
      return;
    }

    const tools = this.buildTools();
    const llmWithTools = tools.length > 0 ? this.llm.bindTools(tools) : this.llm;
    
    const messages: any[] = [
      new SystemMessage('Anda adalah "macli", seorang Swarm Director tingkat lanjut. Pecah tugas pengguna dan gunakan alat (tools) yang tersedia, termasuk tools dari Claude MCP Server, untuk menyelesaikannya. Berikan jawaban komprehensif dalam bahasa Indonesia.'),
      new HumanMessage(taskDescription)
    ];

    let isDone = false;
    let step = 1;

    console.log(pc.cyan('\n[SwarmDirector] Memulai ReAct Loop dengan Dukungan MCP...'));

    while (!isDone && step < 10) {
      const spinner = ora(`[Step ${step}] Swarm AI sedang berpikir...`).start();
      
      try {
        const response = await llmWithTools.invoke(messages);
        messages.push(response);
        spinner.stop();

        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(pc.magenta(`\n🔧 [Agent Memanggil Tool]`));
          
          for (const toolCall of response.tool_calls) {
            console.log(`   ${pc.bold('Tool:')} ${toolCall.name}`);
            console.log(`   ${pc.bold('Input:')} ${JSON.stringify(toolCall.args)}`);
            
            const spinnerTool = ora(`Mengeksekusi ${toolCall.name}...`).start();
            
            const matchedTool = tools.find(t => t.name === toolCall.name);
            let toolResultStr = "Tool tidak ditemukan";
            
            if (matchedTool) {
               const inputArg = typeof toolCall.args === 'string' ? toolCall.args : JSON.stringify(toolCall.args);
               toolResultStr = await matchedTool.invoke(inputArg);
            }

            spinnerTool.succeed(`Selesai mengeksekusi ${toolCall.name}`);
            console.log(pc.dim(`   > ${toolResultStr.substring(0, 300)}${toolResultStr.length > 300 ? '...' : ''}\n`));
            
            messages.push(new ToolMessage({
              tool_call_id: toolCall.id!,
              name: toolCall.name,
              content: toolResultStr
            }));
          }
          step++;
        } else {
          isDone = true;
          console.log(pc.green(pc.bold('\n✨ [SwarmDirector] Tugas Selesai!')));
          console.log(pc.white('============================================='));
          console.log(response.content);
          console.log(pc.white('=============================================\n'));
        }
      } catch (error: any) {
        spinner.fail(pc.red(`Gagal pada langkah ${step}`));
        console.error(pc.red(error.message));
        break;
      }
    }
  }
}

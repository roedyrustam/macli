import { Skill } from '../types';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicTool } from '@langchain/core/tools';
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import ora from 'ora';
import pc from 'picocolors';

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
        description: skill.description || `Gunakan skill ini untuk: ${skill.name}`,
        func: async (input: string) => {
          // Dummy execution simulation for the skill
          return `[HASIL DARI SKILL ${skill.name.toUpperCase()}]: Berhasil mengeksekusi aksi dengan parameter: ${input}`;
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
      new SystemMessage('Anda adalah "macli", seorang Swarm Director tingkat lanjut. Pecah tugas pengguna dan gunakan alat (tools) yang tersedia untuk menyelesaikannya. Berikan jawaban komprehensif dalam bahasa Indonesia.'),
      new HumanMessage(taskDescription)
    ];

    let isDone = false;
    let step = 1;

    console.log(pc.cyan('\n[SwarmDirector] Memulai ReAct Loop...'));

    while (!isDone && step < 10) { // Max 10 steps to prevent infinite loop
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
            
            // Cari tool dan jalankan
            const matchedTool = tools.find(t => t.name === toolCall.name);
            let toolResultStr = "Tool tidak ditemukan";
            
            if (matchedTool) {
               // Langchain DynamicTool takes a single string by default in its simple func mapping
               const inputArg = typeof toolCall.args === 'string' ? toolCall.args : JSON.stringify(toolCall.args);
               toolResultStr = await matchedTool.invoke(inputArg);
            }

            spinnerTool.succeed(`Selesai mengeksekusi ${toolCall.name}`);
            console.log(pc.dim(`   > ${toolResultStr}\n`));
            
            // Masukkan hasil kembali ke conversation history
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

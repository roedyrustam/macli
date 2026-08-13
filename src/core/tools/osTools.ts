import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

const execAsync = promisify(exec);

export const bashTool = new DynamicStructuredTool({
  name: "bash_executor",
  description: "Execute a bash or terminal command natively on the OS. Returns the standard output or error.",
  schema: z.object({
    command: z.string().describe("The bash command to execute"),
  }),
  func: async ({ command }) => {
    try {
      console.log(`\n[OS Tool] Menjalankan perintah bash: ${command}`);
      const { stdout, stderr } = await execAsync(command);
      if (stderr) return `[WARNING/STDERR]:\n${stderr}\n[STDOUT]:\n${stdout}`;
      return stdout || "[Command eksekusi berhasil tanpa output]";
    } catch (e: any) {
      return `[ERROR] Gagal mengeksekusi bash: ${e.message}`;
    }
  },
});

export const fileReaderTool = new DynamicStructuredTool({
  name: "file_reader",
  description: "Read the contents of a file from the local file system.",
  schema: z.object({
    filePath: z.string().describe("Absolute or relative path to the file"),
  }),
  func: async ({ filePath }) => {
    try {
      console.log(`\n[OS Tool] Membaca file: ${filePath}`);
      const content = await readFile(resolve(process.cwd(), filePath), "utf-8");
      return content.substring(0, 10000); // Limit read to 10k chars to prevent context overflow
    } catch (e: any) {
      return `[ERROR] Gagal membaca file: ${e.message}`;
    }
  },
});

export const fileWriterTool = new DynamicStructuredTool({
  name: "file_writer",
  description: "Write or overwrite contents into a file on the local file system.",
  schema: z.object({
    filePath: z.string().describe("Absolute or relative path to the file"),
    content: z.string().describe("The content to write into the file"),
  }),
  func: async ({ filePath, content }) => {
    try {
      console.log(`\n[OS Tool] Menulis ke file: ${filePath}`);
      await writeFile(resolve(process.cwd(), filePath), content, "utf-8");
      return `Berhasil menulis konten ke ${filePath}`;
    } catch (e: any) {
      return `[ERROR] Gagal menulis file: ${e.message}`;
    }
  },
});

export const getOsTools = () => [bashTool, fileReaderTool, fileWriterTool];

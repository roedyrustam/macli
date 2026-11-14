import { DynamicStructuredTool } from '@langchain/core/tools';
import { exec } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { evaluateGuardRules } from '../vibesBridge';

const execAsync = promisify(exec);

export const bashTool = new DynamicStructuredTool({
  name: 'bash_executor',
  description: 'Execute a bash or terminal command natively on the OS. Returns the standard output or error.',
  schema: z.object({
    command: z.string().describe('The bash or shell command to execute'),
  }),
  func: async ({ command }) => {
    try {
      process.stdout.write(`\n[OS Tool] Executing command: ${command}\n`);
      const { stdout, stderr } = await execAsync(command);
      if (stderr) return `[WARNING/STDERR]:\n${stderr}\n[STDOUT]:\n${stdout}`;
      return stdout || '[Command completed with empty stdout]';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `[ERROR] Failed to execute command: ${message}`;
    }
  },
});

export const fileReaderTool = new DynamicStructuredTool({
  name: 'file_reader',
  description: 'Read the contents of a file from the local file system.',
  schema: z.object({
    filePath: z.string().describe('Absolute or relative path to the file'),
  }),
  func: async ({ filePath }) => {
    try {
      process.stdout.write(`\n[OS Tool] Reading file: ${filePath}\n`);
      const content = await readFile(path.resolve(process.cwd(), filePath), 'utf-8');
      return content.substring(0, 12000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `[ERROR] Failed to read file: ${message}`;
    }
  },
});

export const fileWriterTool = new DynamicStructuredTool({
  name: 'file_writer',
  description:
    'Write or overwrite contents into a file on the local file system and automatically run vibes-plug AST/Regex guardrails.',
  schema: z.object({
    filePath: z.string().describe('Absolute or relative path to the file'),
    content: z.string().describe('The content to write into the file'),
  }),
  func: async ({ filePath, content }) => {
    try {
      const targetPath = path.resolve(process.cwd(), filePath);
      process.stdout.write(`\n[OS Tool] Writing file: ${filePath}\n`);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, 'utf-8');

      const guardAudit = await evaluateGuardRules({
        filePath: targetPath,
        code: content,
      });

      if (guardAudit.findingsCount === 0) {
        return `Successfully wrote ${filePath} (Vibes-Plug Guardrails: PASSED, ${guardAudit.rulesEvaluated} rules checked).`;
      }

      const summaryLines = guardAudit.findings.map(
        (f) => `- [${f.severity}] ${f.ruleId} (${f.skill}): ${f.name} -> ${f.remediation}`
      );
      return [
        `Wrote ${filePath}, but Vibes-Plug Guardrails reported ${guardAudit.findingsCount} finding(s) (errors: ${guardAudit.errorCount}, warnings: ${guardAudit.warnCount}):`,
        ...summaryLines,
      ].join('\n');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `[ERROR] Failed to write file: ${message}`;
    }
  },
});

/**
 * Returns built-in OS tools with automatic guardrail auditing on file writes.
 */
export const getOsTools = () => [bashTool, fileReaderTool, fileWriterTool];

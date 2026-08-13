#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { loadSkills } from './core/skillLoader';
import { SwarmDirector } from './core/swarmDirector';
import 'dotenv/config';
import ora from 'ora';
import pc from 'picocolors';

const program = new Command();

program
  .name('macli')
  .description('AI Agent Swarm Orchestrator for Gemini/Antigravity and Claude')
  .version('1.0.0');

program
  .command('run')
  .description('Run a task using the Swarm')
  .argument('<task>', 'The task to execute')
  .option('-d, --dir <path>', 'Directory containing skills (SKILL.md and Claude tools)', process.cwd())
  .action(async (task, options) => {
    console.log(pc.cyan(pc.bold('\n🚀 Starting macli Swarm...')));
    console.log(`${pc.blue('📋 Task:')} ${task}\n`);
    
    const spinner = ora('Memuat skills dari direktori lokal...').start();
    
    try {
      const skillsDir = resolve(options.dir);
      const skills = await loadSkills(skillsDir);
      
      if (skills.length === 0) {
        spinner.warn(pc.yellow('Tidak ada skill yang ditemukan. Melanjutkan dengan agen generik.'));
      } else {
        spinner.succeed(pc.green(`Berhasil memuat ${skills.length} skill(s) ke dalam Swarm Arsenal.`));
      }
      
      const director = new SwarmDirector(skills);
      await director.executeTask(task);
      
    } catch (error: any) {
      spinner.fail(pc.red('Gagal memulai macli.'));
      console.error(error.message);
      process.exit(1);
    }
  });

program.parse();

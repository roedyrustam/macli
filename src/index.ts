#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { loadSkills } from './core/skillLoader';
import { SwarmDirector } from './core/swarmDirector';
import 'dotenv/config';

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
    console.log(`🚀 Starting macli Swarm...`);
    console.log(`📋 Task: ${task}`);
    
    try {
      const skillsDir = resolve(options.dir);
      console.log(`🔍 Loading skills from: ${skillsDir}`);
      
      const skills = await loadSkills(skillsDir);
      console.log(`✅ Loaded ${skills.length} skills.`);
      
      const director = new SwarmDirector(skills);
      await director.executeTask(task);
      
      console.log(`✨ Task execution completed!`);
    } catch (error) {
      console.error('❌ Error executing task:', error);
      process.exit(1);
    }
  });

program.parse();

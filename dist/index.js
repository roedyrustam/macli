#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path_1 = require("path");
const skillLoader_1 = require("./core/skillLoader");
const swarmDirector_1 = require("./core/swarmDirector");
require("dotenv/config");
const program = new commander_1.Command();
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
        const skillsDir = (0, path_1.resolve)(options.dir);
        console.log(`🔍 Loading skills from: ${skillsDir}`);
        const skills = await (0, skillLoader_1.loadSkills)(skillsDir);
        console.log(`✅ Loaded ${skills.length} skills.`);
        const director = new swarmDirector_1.SwarmDirector(skills);
        await director.executeTask(task);
        console.log(`✨ Task execution completed!`);
    }
    catch (error) {
        console.error('❌ Error executing task:', error);
        process.exit(1);
    }
});
program.parse();

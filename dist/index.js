#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const path_1 = require("path");
const skillLoader_1 = require("./core/skillLoader");
const swarmDirector_1 = require("./core/swarmDirector");
require("dotenv/config");
const ora_1 = __importDefault(require("ora"));
const picocolors_1 = __importDefault(require("picocolors"));
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
    console.log(picocolors_1.default.cyan(picocolors_1.default.bold('\n🚀 Starting macli Swarm...')));
    console.log(`${picocolors_1.default.blue('📋 Task:')} ${task}\n`);
    const spinner = (0, ora_1.default)('Memuat skills dari direktori lokal...').start();
    try {
        const skillsDir = (0, path_1.resolve)(options.dir);
        const skills = await (0, skillLoader_1.loadSkills)(skillsDir);
        if (skills.length === 0) {
            spinner.warn(picocolors_1.default.yellow('Tidak ada skill yang ditemukan. Melanjutkan dengan agen generik.'));
        }
        else {
            spinner.succeed(picocolors_1.default.green(`Berhasil memuat ${skills.length} skill(s) ke dalam Swarm Arsenal.`));
        }
        const director = new swarmDirector_1.SwarmDirector(skills);
        await director.executeTask(task);
    }
    catch (error) {
        spinner.fail(picocolors_1.default.red('Gagal memulai macli.'));
        console.error(error.message);
        process.exit(1);
    }
});
program.parse();

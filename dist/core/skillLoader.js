"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSkills = loadSkills;
exports.loadClaudeMcpConfig = loadClaudeMcpConfig;
const promises_1 = require("fs/promises");
const path_1 = require("path");
async function loadSkills(dirPath) {
    const skills = [];
    try {
        const entries = await (0, promises_1.readdir)(dirPath);
        for (const entry of entries) {
            const fullPath = (0, path_1.join)(dirPath, entry);
            const fileStat = await (0, promises_1.stat)(fullPath);
            if (fileStat.isDirectory()) {
                const subSkills = await loadSkills(fullPath);
                skills.push(...subSkills);
            }
            else {
                if (entry === 'SKILL.md') {
                    const content = await (0, promises_1.readFile)(fullPath, 'utf-8');
                    skills.push({
                        id: `antigravity-${dirPath.split(/[\\/]/).pop()}`,
                        name: dirPath.split(/[\\/]/).pop() || 'Unknown Skill',
                        description: 'Antigravity Skill loaded from SKILL.md',
                        source: 'antigravity',
                        content
                    });
                }
            }
        }
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Error loading skills from ${dirPath}:`, error.message);
        }
    }
    return skills;
}
async function loadClaudeMcpConfig(configPath) {
    try {
        const content = await (0, promises_1.readFile)(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.mcpServers) {
            return parsed.mcpServers;
        }
        return null;
    }
    catch (error) {
        return null;
    }
}

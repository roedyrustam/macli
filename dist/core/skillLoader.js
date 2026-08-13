"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSkills = loadSkills;
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
                // Recursive search
                const subSkills = await loadSkills(fullPath);
                skills.push(...subSkills);
            }
            else {
                // Antigravity SKILL.md
                if (entry === 'SKILL.md') {
                    const content = await (0, promises_1.readFile)(fullPath, 'utf-8');
                    // Parse basic metadata (assuming YAML frontmatter or basic structure)
                    // For now, we'll just store the raw content and basic id
                    skills.push({
                        id: `antigravity-${dirPath.split(/[\\/]/).pop()}`,
                        name: dirPath.split(/[\\/]/).pop() || 'Unknown Skill',
                        description: 'Antigravity Skill loaded from SKILL.md',
                        source: 'antigravity',
                        content
                    });
                }
                // Claude / MCP tools - assuming JSON definitions for local parsing
                if ((0, path_1.extname)(entry) === '.json' && entry.includes('claude-skill')) {
                    const content = await (0, promises_1.readFile)(fullPath, 'utf-8');
                    try {
                        const parsed = JSON.parse(content);
                        skills.push({
                            id: parsed.id || `claude-${entry}`,
                            name: parsed.name || entry,
                            description: parsed.description || 'Claude Skill',
                            source: 'claude',
                            metadata: parsed
                        });
                    }
                    catch (e) {
                        console.warn(`Failed to parse Claude skill file: ${fullPath}`);
                    }
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

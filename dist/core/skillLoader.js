"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSkills = loadSkills;
exports.loadGlobalSkills = loadGlobalSkills;
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
const os = __importStar(require("os"));
async function loadGlobalSkills() {
    const globalSkills = [];
    const homedir = os.homedir();
    const configRoot = (0, path_1.join)(homedir, '.gemini', 'config');
    // Load from root skills folder
    const rootSkillsDir = (0, path_1.join)(configRoot, 'skills');
    const rootSkills = await loadSkills(rootSkillsDir);
    globalSkills.push(...rootSkills);
    // Load from plugins folders
    const pluginsDir = (0, path_1.join)(configRoot, 'plugins');
    try {
        const plugins = await (0, promises_1.readdir)(pluginsDir);
        for (const plugin of plugins) {
            const pluginSkillsDir = (0, path_1.join)(pluginsDir, plugin, 'skills');
            const pluginSkills = await loadSkills(pluginSkillsDir);
            globalSkills.push(...pluginSkills);
        }
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Error reading plugins dir: ${err.message}`);
        }
    }
    return globalSkills;
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

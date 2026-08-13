import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { Skill } from '../types';
import { McpServerConfig } from './mcpClient';

export async function loadSkills(dirPath: string): Promise<Skill[]> {
  const skills: Skill[] = [];

  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const fileStat = await stat(fullPath);
      
      if (fileStat.isDirectory()) {
        const subSkills = await loadSkills(fullPath);
        skills.push(...subSkills);
      } else {
        if (entry === 'SKILL.md') {
          const content = await readFile(fullPath, 'utf-8');
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
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
        console.error(`Error loading skills from ${dirPath}:`, error.message);
    }
  }

  return skills;
}

export async function loadClaudeMcpConfig(configPath: string): Promise<Record<string, McpServerConfig> | null> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    if (parsed.mcpServers) {
      return parsed.mcpServers;
    }
    return null;
  } catch (error) {
    return null;
  }
}

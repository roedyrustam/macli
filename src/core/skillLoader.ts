import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { Skill } from '../types';

export async function loadSkills(dirPath: string): Promise<Skill[]> {
  const skills: Skill[] = [];

  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const fileStat = await stat(fullPath);
      
      if (fileStat.isDirectory()) {
        // Recursive search
        const subSkills = await loadSkills(fullPath);
        skills.push(...subSkills);
      } else {
        // Antigravity SKILL.md
        if (entry === 'SKILL.md') {
          const content = await readFile(fullPath, 'utf-8');
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
        if (extname(entry) === '.json' && entry.includes('claude-skill')) {
           const content = await readFile(fullPath, 'utf-8');
           try {
             const parsed = JSON.parse(content);
             skills.push({
               id: parsed.id || `claude-${entry}`,
               name: parsed.name || entry,
               description: parsed.description || 'Claude Skill',
               source: 'claude',
               metadata: parsed
             });
           } catch (e) {
             console.warn(`Failed to parse Claude skill file: ${fullPath}`);
           }
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

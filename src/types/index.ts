export interface Skill {
  id: string;
  name: string;
  description: string;
  source: 'antigravity' | 'claude';
  content?: string;
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

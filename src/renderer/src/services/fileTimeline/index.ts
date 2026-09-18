export type TimelineAction = 'created' | 'opened' | 'modified' | 'saved' | 'closed';

export interface TimelineEntry {
  id: string;
  filePath: string;
  action: TimelineAction;
  timestamp: Date;
  detail?: string;
}

class FileTimelineService {
  private timelines: Map<string, TimelineEntry[]> = new Map();
  private listeners: Set<(filePath: string) => void> = new Set();

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (typeof localStorage === 'undefined') return
      const saved = localStorage.getItem('fileTimelines');
      if (saved) {
        const data = JSON.parse(saved);
        for (const [path, entries] of Object.entries(data)) {
          this.timelines.set(path, (entries as any[]).map(e => ({
            ...e,
            timestamp: new Date(e.timestamp)
          })));
        }
      }
    } catch (e) {
      console.error('Error loading timelines:', e);
    }
  }

  private save() {
    if (typeof localStorage === 'undefined') return
    const obj: Record<string, TimelineEntry[]> = {};
    this.timelines.forEach((entries, path) => {
      // Solo guardar las últimas 50 entradas por archivo
      obj[path] = entries.slice(0, 50);
    });
    localStorage.setItem('fileTimelines', JSON.stringify(obj));
  }

  private notify(filePath: string) {
    this.listeners.forEach(fn => fn(filePath));
  }

  subscribe(fn: (filePath: string) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  addEntry(filePath: string, action: TimelineAction, detail?: string) {
    const entries = this.timelines.get(filePath) || [];
    
    const entry: TimelineEntry = {
      id: `tl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filePath,
      action,
      timestamp: new Date(),
      detail
    };

    // Evitar duplicados muy cercanos (menos de 1 segundo)
    const lastEntry = entries[0];
    if (lastEntry && 
        lastEntry.action === action && 
        Date.now() - lastEntry.timestamp.getTime() < 1000) {
      return;
    }

    entries.unshift(entry);
    this.timelines.set(filePath, entries.slice(0, 100));
    this.save();
    this.notify(filePath);
  }

  getForFile(filePath: string): TimelineEntry[] {
    return this.timelines.get(filePath) || [];
  }

  getCreatedDate(filePath: string): Date | undefined {
    const entries = this.timelines.get(filePath) || [];
    const created = entries.find(e => e.action === 'created');
    if (created) return created.timestamp;
    
    // Si no hay entrada de creación, usar la primera entrada
    const oldest = entries[entries.length - 1];
    return oldest?.timestamp;
  }

  clear(filePath?: string) {
    if (filePath) {
      this.timelines.delete(filePath);
    } else {
      this.timelines.clear();
    }
    this.save();
  }
}

export const fileTimelineService = new FileTimelineService();

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Annotation {
  id: string;
  filePath: string;
  fileName: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export class AnnotationStore {
  private annotations: Annotation[] = [];
  private storageFile: string;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private context: vscode.ExtensionContext) {
    this.storageFile = this.resolveStoragePath();
    this.load();
  }

  private resolveStoragePath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const vscodePath = path.join(workspaceFolders[0].uri.fsPath, '.vscode');
      if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath, { recursive: true });
      }
      return path.join(vscodePath, 'annotations.json');
    }
    const globalPath = this.context.globalStorageUri.fsPath;
    if (!fs.existsSync(globalPath)) {
      fs.mkdirSync(globalPath, { recursive: true });
    }
    return path.join(globalPath, 'annotations.json');
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        this.annotations = JSON.parse(raw) as Annotation[];
      }
    } catch {
      try { fs.copyFileSync(this.storageFile, this.storageFile + '.bak'); } catch {}
      this.annotations = [];
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.storageFile, JSON.stringify(this.annotations, null, 2), 'utf-8');
    } catch (err) {
      vscode.window.showErrorMessage(`Code Annotator: failed to save annotations — ${err}`);
    }
  }

  getAll(): Annotation[] {
    return [...this.annotations];
  }

  add(annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>): Annotation {
    const now = new Date().toISOString();
    const a: Annotation = {
      ...annotation,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.annotations.push(a);
    this.save();
    this._onDidChange.fire();
    return a;
  }

  update(id: string, note: string, silent = false): boolean {
    const idx = this.annotations.findIndex(a => a.id === id);
    if (idx === -1) return false;
    this.annotations[idx].note = note;
    this.annotations[idx].updatedAt = new Date().toISOString();
    this.save();
    if (!silent) this._onDidChange.fire();
    return true;
  }

  remove(id: string): boolean {
    const before = this.annotations.length;
    this.annotations = this.annotations.filter(a => a.id !== id);
    if (this.annotations.length === before) return false;
    this.save();
    this._onDidChange.fire();
    return true;
  }

  clearAll(): void {
    this.annotations = [];
    this.save();
    this._onDidChange.fire();
  }

  toMarkdown(): string {
    if (this.annotations.length === 0) return '> No annotations yet.';

    const byFile = new Map<string, Annotation[]>();
    for (const a of this.annotations) {
      if (!byFile.has(a.filePath)) byFile.set(a.filePath, []);
      byFile.get(a.filePath)!.push(a);
    }

    const sections: string[] = ['# Code Annotations\n'];

    for (const [, items] of byFile) {
      const sorted = [...items].sort((a, b) => a.startLine - b.startLine);
      const filePath = sorted[0].filePath;
      const fileName = sorted[0].fileName;
      sections.push(`## 📄 ${filePath}\n`);

      for (const a of sorted) {
        const lineRef = a.startLine === a.endLine
          ? `L${a.startLine}`
          : `L${a.startLine}–${a.endLine}`;
        sections.push(`### ${lineRef}`);

        if (a.selectedText.trim()) {
          const ext = path.extname(a.fileName).slice(1) || '';
          sections.push(`\`\`\`${ext}`);
          sections.push(a.selectedText.trimEnd());
          sections.push('```');
        }

        sections.push(`**批注**: ${a.note}`);
        sections.push('');
        sections.push('---');
        sections.push('');
      }
    }

    return sections.join('\n');
  }
}

import * as vscode from 'vscode';
import * as path from 'path';
import { AnnotationStore, Annotation } from './annotationStore';
import { InlineCommentController } from './commentController';

export class AnnotationPanel {
  private static instance: AnnotationPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private store: AnnotationStore,
    private commentCtrl: InlineCommentController,
    extensionUri: vscode.Uri,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'codeAnnotator',
      'Code Annotations',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.store.onDidChange(() => this.refresh(), null, this.disposables);

    this.refresh();
  }

  static show(store: AnnotationStore, commentCtrl: InlineCommentController, extensionUri: vscode.Uri): AnnotationPanel {
    if (AnnotationPanel.instance) {
      AnnotationPanel.instance.panel.reveal(vscode.ViewColumn.Beside, true);
      return AnnotationPanel.instance;
    }
    AnnotationPanel.instance = new AnnotationPanel(store, commentCtrl, extensionUri);
    return AnnotationPanel.instance;
  }

  private async handleMessage(msg: { command: string; id?: string; note?: string; filePath?: string; line?: number }): Promise<void> {
    switch (msg.command) {
      case 'updateNote':
        if (msg.id && msg.note !== undefined) {
          this.store.update(msg.id, msg.note);
          this.commentCtrl.updateThreadNote(msg.id, msg.note);
        }
        break;
      case 'deleteAnnotation':
        if (msg.id) {
          this.store.remove(msg.id);
        }
        break;
      case 'jumpToLine':
        if (msg.filePath && msg.line !== undefined) {
          const uri = vscode.Uri.file(msg.filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
          const lineIndex = msg.line - 1;
          const range = editor.document.lineAt(lineIndex).range;
          editor.selection = new vscode.Selection(range.start, range.start);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
        break;
      case 'copyAll':
        await vscode.env.clipboard.writeText(this.store.toMarkdown());
        vscode.window.showInformationMessage('Annotations copied to clipboard!');
        break;
      case 'clearAll':
        const confirmed = await vscode.window.showWarningMessage(
          'Clear all annotations?',
          { modal: true },
          'Clear',
        );
        if (confirmed === 'Clear') {
          this.store.clearAll();
        }
        break;
      case 'expandAll':
        this.commentCtrl.expandAllThreads();
        break;
      case 'collapseAll':
        this.commentCtrl.collapseAllThreads();
        break;
    }
  }

  refresh(): void {
    this.panel.webview.postMessage({ command: 'beforeRefresh' });
    setTimeout(() => {
      this.panel.webview.html = this.buildHtml(this.store.getAll());
    }, 10);
  }

  private buildHtml(annotations: Annotation[]): string {
    const grouped = new Map<string, Annotation[]>();
    for (const a of annotations) {
      if (!grouped.has(a.filePath)) grouped.set(a.filePath, []);
      grouped.get(a.filePath)!.push(a);
    }

    let annotationGroups = '';

    if (annotations.length === 0) {
      annotationGroups = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <p>No annotations yet</p>
          <p class="hint">Select code → Right-click → <strong>Add Annotation</strong><br>or use <kbd>⌘⇧A</kbd></p>
        </div>`;
    } else {
      for (const [filePath, items] of grouped) {
        const sorted = [...items].sort((a, b) => a.startLine - b.startLine);
        const fileName = sorted[0].fileName;

        const cards = sorted.map(a => {
          const lineRef = a.startLine === a.endLine
            ? `L${a.startLine}`
            : `L${a.startLine}–${a.endLine}`;
          const selectedTextHtml = a.selectedText.trim()
            ? `<pre class="code-snippet">${this.escapeHtml(a.selectedText)}</pre>`
            : '';
          const timestamp = new Date(a.updatedAt).toLocaleString();

          return `
            <details class="annotation-card" data-id="${a.id}" open>
              <summary class="card-header">
                <button class="line-ref" onclick="event.preventDefault(); jumpTo('${this.escapeHtml(filePath)}', ${a.startLine})" title="Jump to code">
                  ${this.escapeHtml(fileName)} · <span class="line-badge">${lineRef}</span>
                </button>
                <button class="delete-btn" onclick="event.preventDefault(); deleteAnnotation('${a.id}')" title="Delete">✕</button>
              </summary>
              ${selectedTextHtml}
              <div class="note-area" data-id="${a.id}">
                <textarea
                  class="note-input"
                  data-id="${a.id}"
                  data-original="${this.escapeHtml(a.note)}"
                  oninput="onNoteInput(this)"
                  onkeydown="onNoteKeydown(event, '${a.id}')"
                  placeholder="Write your annotation..."
                >${this.escapeHtml(a.note)}</textarea>
                <div class="note-actions hidden" data-id="${a.id}">
                  <button class="btn-save" onclick="commitNote('${a.id}')">✓ 保存</button>
                  <button class="btn-cancel" onclick="cancelNote('${a.id}')">✕ 取消</button>
                  <span class="save-hint"><kbd>⌘↵</kbd> 保存</span>
                </div>
              </div>
              <div class="card-footer">
                <span class="timestamp">${timestamp}</span>
              </div>
            </details>`;
        }).join('');

        annotationGroups += `
          <div class="file-group">
            <div class="file-header">
              <span class="file-icon">📄</span>
              <span class="file-name" title="${this.escapeHtml(filePath)}">${this.escapeHtml(fileName)}</span>
              <span class="file-count">${sorted.length}</span>
            </div>
            <div class="file-cards">${cards}</div>
          </div>`;
      }
    }

    const count = annotations.length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Annotations</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0;
    }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
    }

    .toolbar-title {
      flex: 1;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-sideBarTitle-foreground);
    }

    .count-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      padding: 1px 7px;
      font-size: 11px;
      font-weight: 600;
    }

    .btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--vscode-icon-foreground);
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .btn-primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .content { padding: 10px 12px; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 20px;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
    }

    .empty-icon { font-size: 32px; margin-bottom: 8px; }

    .hint {
      font-size: 12px;
      line-height: 1.6;
    }

    kbd {
      background: var(--vscode-keybindingLabel-background);
      border: 1px solid var(--vscode-keybindingLabel-border);
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 11px;
      font-family: var(--vscode-editor-font-family);
    }

    .file-group { margin-bottom: 16px; }

    .file-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      margin-bottom: 6px;
      border-radius: 4px;
      background: var(--vscode-sideBarSectionHeader-background);
    }

    .file-name {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-sideBar-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-count {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 8px;
      padding: 0 6px;
      font-size: 11px;
      min-width: 18px;
      text-align: center;
    }

    .annotation-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      margin-bottom: 8px;
      overflow: hidden;
      transition: border-color 0.15s;
    }

    .annotation-card:hover { border-color: var(--vscode-focusBorder); }

    .card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      list-style: none;
      cursor: pointer;
      user-select: none;
    }

    .annotation-card:not([open]) .card-header {
      border-bottom: none;
    }

    .card-header::-webkit-details-marker { display: none; }
    .card-header::marker { display: none; }

    .line-ref {
      flex: 1;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
      text-align: left;
      padding: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .line-ref:hover { text-decoration: underline; }

    .line-badge {
      background: var(--vscode-editorLineNumber-foreground);
      color: var(--vscode-editor-background);
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 10px;
      font-weight: 600;
    }

    .delete-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 3px;
      opacity: 0.6;
    }

    .delete-btn:hover {
      opacity: 1;
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
    }

    .code-snippet {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      line-height: 1.5;
      padding: 8px 10px;
      background: var(--vscode-textCodeBlock-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      overflow-x: auto;
      white-space: pre;
      max-height: 120px;
      color: var(--vscode-editor-foreground);
    }

    .note-input {
      width: 100%;
      padding: 8px 10px;
      background: transparent;
      border: none;
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      min-height: 60px;
      outline: none;
    }

    .note-input:focus {
      background: var(--vscode-input-background);
    }

    .note-input::placeholder { color: var(--vscode-input-placeholderForeground); }

    .note-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px 8px;
    }

    .note-actions.hidden { display: none; }

    .btn-save {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 3px 10px;
      font-size: 12px;
      cursor: pointer;
      font-weight: 500;
    }

    .btn-save:hover { background: var(--vscode-button-hoverBackground); }

    .btn-cancel {
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      padding: 3px 10px;
      font-size: 12px;
      cursor: pointer;
    }

    .btn-cancel:hover { background: var(--vscode-toolbar-hoverBackground); }

    .save-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-left: auto;
    }

    .card-footer {
      padding: 4px 10px 6px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .timestamp {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="toolbar-title">Annotations</span>
    <span class="count-badge">${count}</span>
    <button class="btn" onclick="expandAll()" title="Expand all">⊞</button>
    <button class="btn" onclick="collapseAll()" title="Collapse all">⊟</button>
    <button class="btn btn-primary" onclick="copyAll()" title="Copy all as Markdown for Claude">⎘ Copy All</button>
    <button class="btn" onclick="clearAll()" title="Clear all annotations">🗑</button>
  </div>

  <div class="content">
    ${annotationGroups}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function expandAll() {
      document.querySelectorAll('.annotation-card').forEach(el => el.setAttribute('open', ''));
      vscode.postMessage({ command: 'expandAll' });
    }

    function collapseAll() {
      document.querySelectorAll('.annotation-card').forEach(el => el.removeAttribute('open'));
      vscode.postMessage({ command: 'collapseAll' });
    }

    function jumpTo(filePath, line) {
      vscode.postMessage({ command: 'jumpToLine', filePath, line });
    }

    function onNoteInput(textarea) {
      const id = textarea.dataset.id;
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      const actions = document.querySelector('.note-actions[data-id="' + id + '"]');
      if (actions) actions.classList.remove('hidden');
    }

    function onNoteKeydown(event, id) {
      if (event.isComposing || event.keyCode === 229) return;
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modKey = isMac ? event.metaKey : event.ctrlKey;
      if (modKey && event.key === 'Enter') {
        event.preventDefault();
        commitNote(id);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelNote(id);
      }
    }

    function commitNote(id) {
      const textarea = document.querySelector('.note-input[data-id="' + id + '"]');
      if (!textarea) return;
      const note = textarea.value;
      textarea.dataset.original = note;
      const actions = document.querySelector('.note-actions[data-id="' + id + '"]');
      if (actions) actions.classList.add('hidden');
      vscode.postMessage({ command: 'updateNote', id, note });
    }

    function cancelNote(id) {
      const textarea = document.querySelector('.note-input[data-id="' + id + '"]');
      if (!textarea) return;
      textarea.value = textarea.dataset.original || '';
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      const actions = document.querySelector('.note-actions[data-id="' + id + '"]');
      if (actions) actions.classList.add('hidden');
    }

    function deleteAnnotation(id) {
      vscode.postMessage({ command: 'deleteAnnotation', id });
    }

    function copyAll() {
      vscode.postMessage({ command: 'copyAll' });
    }

    function clearAll() {
      vscode.postMessage({ command: 'clearAll' });
    }

    function saveDraftState() {
      const drafts = {};
      document.querySelectorAll('.note-input').forEach(el => {
        const id = el.dataset.id;
        const original = el.dataset.original || '';
        if (el.value !== original) {
          drafts[id] = el.value;
        }
      });
      vscode.setState({ drafts });
    }

    function restoreDraftState() {
      const state = vscode.getState();
      if (!state || !state.drafts) return;
      Object.entries(state.drafts).forEach(([id, value]) => {
        const textarea = document.querySelector('.note-input[data-id="' + id + '"]');
        if (textarea) {
          textarea.value = value;
          textarea.style.height = 'auto';
          textarea.style.height = textarea.scrollHeight + 'px';
          const actions = document.querySelector('.note-actions[data-id="' + id + '"]');
          if (actions) actions.classList.remove('hidden');
        }
      });
      vscode.setState({ drafts: {} });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'beforeRefresh') {
        saveDraftState();
      }
    });

    document.querySelectorAll('.note-input').forEach(el => {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    });

    restoreDraftState();
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  dispose(): void {
    AnnotationPanel.instance = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

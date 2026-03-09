import * as vscode from 'vscode';
import * as path from 'path';
import { AnnotationStore } from './annotationStore';

export class InlineCommentController {
  private controller: vscode.CommentController;
  private threadMap = new Map<string, vscode.CommentThread>();
  private pendingThread: vscode.CommentThread | undefined;

  constructor(private store: AnnotationStore) {
    this.controller = vscode.comments.createCommentController(
      'codeAnnotator',
      'Code Annotator',
    );
    this.controller.options = {
      prompt: '添加批注…',
      placeHolder: '输入批注内容，点击 Save 保存',
    };
    this.controller.commentingRangeProvider = {
      provideCommentingRanges(document: vscode.TextDocument) {
        return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
      },
    };

    this.syncThreadsFromStore();
    store.onDidChange(() => this.syncThreadsFromStore());
  }

  promptNewAnnotation(editor: vscode.TextEditor): void {
    if (this.pendingThread) {
      this.pendingThread.dispose();
      this.pendingThread = undefined;
    }

    const selection = editor.selection;
    const range = new vscode.Range(selection.start, selection.end);
    const startLine = range.start.line + 1;
    const endLine = range.end.line + 1;
    const lineRef = startLine === endLine ? `L${startLine}` : `L${startLine}–${endLine}`;

    const thread = this.controller.createCommentThread(editor.document.uri, range, []);
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    thread.canReply = true;
    thread.label = `正在批注 ${lineRef}`;

    const placeholder: vscode.Comment = {
      author: { name: 'Code Annotator' },
      body: new vscode.MarkdownString('_在下方输入批注，按 **Save** 保存_'),
      mode: vscode.CommentMode.Preview,
    };
    thread.comments = [placeholder];

    this.pendingThread = thread;
  }

  commitPendingAnnotation(thread: vscode.CommentThread, reply: vscode.CommentReply): void {
    const note = reply.text.trim();
    if (!note) {
      thread.dispose();
      this.pendingThread = undefined;
      return;
    }

    const uri = thread.uri;
    const filePath = uri.fsPath;
    const fileName = path.basename(filePath);
    const range = thread.range;
    if (!range) {
      thread.dispose();
      this.pendingThread = undefined;
      return;
    }
    const startLine = range.start.line + 1;
    const endLine = range.end.line + 1;

    let selectedText = '';
    const editors = vscode.window.visibleTextEditors;
    const matchingEditor = editors.find(e => e.document.uri.fsPath === filePath);
    if (matchingEditor) {
      selectedText = matchingEditor.document.getText(range);
    }

    thread.dispose();
    this.pendingThread = undefined;

    this.store.add({ filePath, fileName, startLine, endLine, selectedText, note });
  }

  cancelPending(): void {
    if (this.pendingThread) {
      this.pendingThread.dispose();
      this.pendingThread = undefined;
    }
  }

  private syncThreadsFromStore(): void {
    const annotations = this.store.getAll();
    const currentIds = new Set(annotations.map(a => a.id));

    for (const [id, thread] of this.threadMap) {
      if (!currentIds.has(id)) {
        thread.dispose();
        this.threadMap.delete(id);
      }
    }

    for (const annotation of annotations) {
      if (this.threadMap.has(annotation.id)) continue;

      const uri = vscode.Uri.file(annotation.filePath);
      const range = new vscode.Range(
        annotation.startLine - 1, 0,
        annotation.endLine - 1, 0,
      );

      const thread = this.controller.createCommentThread(uri, range, []);
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
      thread.canReply = false;
      thread.label = annotation.fileName;
      thread.contextValue = `annotationId:${annotation.id}`;

      const comment: vscode.Comment = {
        author: { name: '📝' },
        body: new vscode.MarkdownString(this.escapeMarkdown(annotation.note)),
        mode: vscode.CommentMode.Preview,
      };
      thread.comments = [comment];
      this.threadMap.set(annotation.id, thread);
    }
  }

  deleteByThread(thread: vscode.CommentThread): void {
    const contextValue = thread.contextValue ?? '';
    const match = contextValue.match(/^annotationId:(.+)$/);
    if (!match) return;
    const id = match[1];
    this.store.remove(id);
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
  }

  dispose(): void {
    for (const thread of this.threadMap.values()) thread.dispose();
    this.threadMap.clear();
    this.controller.dispose();
  }
}


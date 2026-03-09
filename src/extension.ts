import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { AnnotationPanel } from './annotationPanel';
import { InlineCommentController } from './commentController';

export function activate(context: vscode.ExtensionContext): void {
  const store = new AnnotationStore(context);
  const commentCtrl = new InlineCommentController(store);

  context.subscriptions.push(
    commentCtrl,

    vscode.commands.registerCommand('codeAnnotator.addAnnotation', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      commentCtrl.promptNewAnnotation(editor);
    }),

    vscode.commands.registerCommand(
      'codeAnnotator.replyHandler',
      (reply: vscode.CommentReply) => {
        commentCtrl.commitPendingAnnotation(reply.thread, reply);
        AnnotationPanel.show(store, context.extensionUri);
      },
    ),

    vscode.commands.registerCommand(
      'codeAnnotator.deleteThread',
      (thread: vscode.CommentThread) => {
        commentCtrl.deleteByThread(thread);
      },
    ),

    vscode.commands.registerCommand('codeAnnotator.openPanel', () => {
      AnnotationPanel.show(store, context.extensionUri);
    }),

    vscode.commands.registerCommand('codeAnnotator.copyToClipboard', async () => {
      await vscode.env.clipboard.writeText(store.toMarkdown());
      vscode.window.showInformationMessage('Annotations copied to clipboard!');
    }),

    vscode.commands.registerCommand('codeAnnotator.clearAll', async () => {
      const confirmed = await vscode.window.showWarningMessage(
        'Clear all annotations?',
        { modal: true },
        'Clear',
      );
      if (confirmed === 'Clear') store.clearAll();
    }),
  );
}

export function deactivate(): void {}


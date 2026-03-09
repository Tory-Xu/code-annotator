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
        AnnotationPanel.show(store, commentCtrl, context.extensionUri);
      },
    ),

    vscode.commands.registerCommand(
      'codeAnnotator.deleteThread',
      (thread: vscode.CommentThread) => {
        commentCtrl.deleteByThread(thread);
      },
    ),

    vscode.commands.registerCommand(
      'codeAnnotator.editComment',
      (comment: vscode.Comment, thread: vscode.CommentThread) => {
        commentCtrl.startEditComment(comment, thread);
      },
    ),

    vscode.commands.registerCommand(
      'codeAnnotator.saveEditedComment',
      (comment: vscode.Comment, thread: vscode.CommentThread) => {
        commentCtrl.saveEditedComment(comment, thread);
      },
    ),

    vscode.commands.registerCommand(
      'codeAnnotator.cancelEditComment',
      (comment: vscode.Comment, thread: vscode.CommentThread) => {
        commentCtrl.cancelEditComment(comment, thread);
      },
    ),

    vscode.commands.registerCommand('codeAnnotator.openPanel', () => {
      AnnotationPanel.show(store, commentCtrl, context.extensionUri);
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


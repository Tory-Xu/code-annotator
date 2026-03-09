import * as vscode from 'vscode';
import * as path from 'path';
import { AnnotationStore } from './annotationStore';
import { AnnotationPanel } from './annotationPanel';

export function activate(context: vscode.ExtensionContext): void {
  const store = new AnnotationStore(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('codeAnnotator.addAnnotation', () =>
      addAnnotation(store, context.extensionUri),
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

async function addAnnotation(store: AnnotationStore, extensionUri: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;
  const selectedText = editor.document.getText(selection);
  const filePath = editor.document.uri.fsPath;
  const fileName = path.basename(filePath);

  const lineRef = startLine === endLine ? `L${startLine}` : `L${startLine}–${endLine}`;
  const placeholder = selectedText.trim()
    ? selectedText.split('\n')[0].trim().slice(0, 60)
    : '';

  const note = await vscode.window.showInputBox({
    title: `Annotate ${fileName} · ${lineRef}`,
    prompt: placeholder ? `Selected: "${placeholder}${placeholder.length >= 60 ? '…' : ''}"` : 'No selection — annotating cursor position',
    placeHolder: 'Write your annotation…',
    ignoreFocusOut: true,
  });

  if (note === undefined) return;

  store.add({ filePath, fileName, startLine, endLine, selectedText, note });

  AnnotationPanel.show(store, extensionUri);
}

export function deactivate(): void {}

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
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
      (comment: vscode.Comment) => {
        const id = commentCtrl.startEditComment(comment);
        if (!id) return;
        const panel = AnnotationPanel.show(store, commentCtrl, context.extensionUri);
        panel.scrollToAnnotation(id);
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

    vscode.commands.registerCommand('codeAnnotator.installClaudeInitPlan', async () => {
      const binDir = path.join(os.homedir(), '.local', 'bin');
      const scriptPath = path.join(binDir, 'claude-init-plan');

      const scriptContent = `#!/usr/bin/env bash
# 在当前项目目录下配置 Claude plan 模式，将计划文档存储到 .claude/plan/

set -e

CLAUDE_DIR=".claude"
PLAN_DIR=".claude/plan"
SETTINGS_FILE=".claude/settings.json"

# 创建 .claude 目录
if [ ! -d "$CLAUDE_DIR" ]; then
  mkdir -p "$CLAUDE_DIR"
  echo "✓ 创建目录: $CLAUDE_DIR"
fi

# 创建 .claude/plan 目录
if [ ! -d "$PLAN_DIR" ]; then
  mkdir -p "$PLAN_DIR"
  echo "✓ 创建目录: $PLAN_DIR"
fi

# 处理 settings.json
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{"plansDirectory": ".claude/plan"}' > "$SETTINGS_FILE"
  echo "✓ 创建文件: $SETTINGS_FILE"
elif ! command -v node &>/dev/null && ! command -v python3 &>/dev/null; then
  echo "⚠ 警告: 需要 node 或 python3 来合并 JSON，跳过 settings.json 修改"
  exit 1
else
  if command -v node &>/dev/null; then
    node -e "
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      const existing = data.plansDirectory;
      if (existing === '.claude/plan') {
        console.log('- 跳过: plansDirectory 已是 .claude/plan');
        process.exit(0);
      }
      if (existing) {
        console.log('- 覆盖: plansDirectory \\\"' + existing + '\\\" → \\\".claude/plan\\\"');
      } else {
        console.log('✓ 更新: 添加 plansDirectory 到 $SETTINGS_FILE');
      }
      data.plansDirectory = '.claude/plan';
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(data, null, 2) + '\\n');
    "
  else
    python3 - <<'EOF'
import json, sys
with open('.claude/settings.json', 'r') as f:
    data = json.load(f)
existing = data.get('plansDirectory')
if existing == '.claude/plan':
    print('- 跳过: plansDirectory 已是 .claude/plan')
    sys.exit(0)
if existing:
    print(f'- 覆盖: plansDirectory "{existing}" → ".claude/plan"')
else:
    print('✓ 更新: 添加 plansDirectory 到 .claude/settings.json')
data['plansDirectory'] = '.claude/plan'
with open('.claude/settings.json', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\\n')
EOF
  fi
fi

echo ""
echo "完成！当前项目的 plan 文件将保存到 .claude/plan/"
`;

      try {
        if (!fs.existsSync(binDir)) {
          fs.mkdirSync(binDir, { recursive: true });
        }
        fs.writeFileSync(scriptPath, scriptContent, { encoding: 'utf8' });
        execSync(`chmod +x "${scriptPath}"`);
        vscode.window.showInformationMessage(
          `claude-init-plan 已安装到 ${scriptPath}`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(`安装失败: ${(err as Error).message}`);
      }
    }),
  );
}

export function deactivate(): void {}


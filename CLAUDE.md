# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile      # TypeScript → out/
npm run watch        # 监听模式，开发时使用
```

测试方式：在 VSCode 中按 F5 启动 Extension Development Host。无自动化测试框架。

## Architecture

这是一个 VSCode 扩展，入口为 `out/extension.js`（由 `src/` 编译而来）。

### 核心模块

**`src/extension.ts`** — 激活入口，注册所有命令，持有 `store` 和 `commentCtrl` 单例，负责将三个核心模块串联起来。

**`src/annotationStore.ts`** — 数据层。批注持久化到工作区的 `.vscode/annotations.json`（无工作区则用全局存储）。提供 `onDidChange` 事件供其他模块订阅。`toMarkdown()` 生成供 Claude 使用的 Markdown 输出，文件分组标题使用完整路径。

**`src/commentController.ts`** — 内联批注层。使用 VSCode CommentController API 在编辑器中显示 thread。维护 `threadMap`（annotationId → CommentThread）并通过 `syncThreadsFromStore()` 与 store 保持同步。有可见性状态（`visible`）：面板关闭时调用 `hideThreads()` dispose 所有 thread，面板打开时调用 `showThreads()` 重新同步。

**`src/annotationPanel.ts`** — 右侧 Webview 面板（单例模式，`AnnotationPanel.instance`）。面板 dispose 时触发 `commentCtrl.hideThreads()`，构造时触发 `commentCtrl.showThreads()`，实现"开面板 = 进入批注模式"的语义。

### 数据流

```
用户操作（⌘⇧A / 右键菜单）
  → commentCtrl.promptNewAnnotation()   # 创建临时 pending thread
  → 用户输入后 commitPendingAnnotation()
  → store.add()                          # 持久化
  → store.onDidChange 触发
  → commentCtrl.syncThreadsFromStore()  # 更新内联 thread
  → annotationPanel.refresh()            # 更新 Webview
```

### 关键约束

- `AnnotationPanel` 是单例，`show()` 时若已存在则 reveal 而非重建
- CommentThread 的 `contextValue` 格式为 `annotationId:<id>`，comment 的 `contextValue` 格式为 `annotationPreview:<id>`，菜单的 `when` 条件依赖这两个格式
- 左侧编辑按钮（`codeAnnotator.editComment`）触发后会打开面板并滚动到对应批注（`scrollToAnnotation`）

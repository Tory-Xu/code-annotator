# Code Annotator

在代码中添加批注，汇总后一键复制给 Claude Code。

## 功能

- 选中代码后添加批注，内联显示在编辑器左侧
- 右侧面板统一管理所有批注，支持编辑、删除、跳转
- 一键复制全部批注为 Markdown，粘贴给 Claude Code 即可提问

## 快捷键

| 操作 | Mac | Windows/Linux |
|------|-----|---------------|
| 添加批注 | `⌘⇧A` | `Ctrl+Shift+A` |
| 打开/显示面板 | `⌘⇧N` | `Ctrl+Shift+N` |

也可以选中代码后右键菜单 → **Add Annotation**。

## 使用流程

1. **添加批注**：选中代码（或将光标置于某行），按 `⌘⇧A`，在弹出的输入框中写下批注，点击 **Save**
2. **管理批注**：按 `⌘⇧N` 打开右侧面板，可编辑内容、点击行号跳转到代码、删除单条或清空全部
3. **发给 Claude**：面板顶部点击 **⎘ Copy All**，将 Markdown 粘贴到 Claude Code 对话框

## 批注模式

打开面板（`⌘⇧N`）= 进入批注模式，内联批注在编辑器中可见。
关闭面板（点击 `×` 或 `⌘W`）= 退出批注模式，内联批注隐藏，数据不丢失。

## 数据存储

批注保存在工作区的 `.vscode/annotations.json`，提交到 Git 可与团队共享。无工作区时使用 VSCode 全局存储。

## 输出格式示例

```markdown
# Code Annotations

## 📄 /path/to/project/src/foo.ts

### `foo.ts` L42
```ts
const result = await fetchData(url)
```
**批注**: 这里没有处理网络超时的情况

---
```

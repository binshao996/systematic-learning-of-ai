# Notion AI 写作助手 — 设计规格

## 目标

1:1 复刻 Notion AI 的编辑器内 AI 写作体验。AI 能力完全融入编辑器，不再有独立 Chat 面板。

## 架构

```
TipTap Editor
  ├── AICommand (extension) — /ai 斜杠命令 + 空行空格触发
  ├── AIBlock (node) — AI 输入/回答块，支持流式输出和继续对话
  └── AIBubbleMenu (component) — 选中文字浮动菜单（增强现有 AIWritingMenu）
```

后端不变，复用现有 Chat API、RAG engine、Search API。

## UI 布局

移除右侧 ChatPanel (w-80)，编辑器改为居中全宽 (max-w-3xl mx-auto)。

```
┌──────────┬────────────────────────────────────────────┐
│ Sidebar  │  Toolbar (sticky)                          │
│ w-60     ├────────────────────────────────────────────┤
│          │  Editor (max-w-3xl, mx-auto)                │
│          │  AI 块 内联于编辑器中                         │
└──────────┴────────────────────────────────────────────┘
```

## 三种 AI 交互

### 1. 空行调起 AI

- 触发：空行按 Space 或输入 `/ai`
- 流程：插入 AI 输入块 → 用户输入指令 → Enter → SSE 流式输出 → 回答插入 AI 块
- 操作栏：✓ Keep | ↻ Retry | ✕ Discard | Continue↗
- AI 块内可继续对话修改内容

### 2. 选中文字 AI 菜单

- 触发：选中任意文字
- 浮动菜单选项：Improve writing / Rewrite professionally / Summarize / Translate / Make longer-shorter / Change tone
- 结果：替换原文或追加到下方
- 增强现有 AIWritingMenu 组件

### 3. 跨文档 AI 问答

- 触发：`/aik` 或 "Ask AI about your knowledge base"
- AI 块进入知识库模式，检索所有文档的向量索引
- 回答带引用来源（文档名、段落）

## 实现方案

### 新增文件

| 文件 | 说明 |
|------|------|
| `frontend/src/extensions/ai-block.ts` | AI 块 TipTap Node，定义 AI 输入/回答块的数据结构 |
| `frontend/src/extensions/ai-command.ts` | AI 斜杠命令 TipTap Extension，注册 `/ai` `/aik` 命令 |
| `frontend/src/components/editor/ai-block-view.tsx` | AI 块的 React 视图组件（输入框、流式输出、操作栏） |
| `frontend/src/components/editor/ai-bubble-menu.tsx` | 增强版选中文字浮动菜单（替换 AIWritingMenu） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `frontend/src/app/(main)/layout.tsx` | 移除 SearchDialog（已做），无其他改动 |
| `frontend/src/app/(main)/[docId]/page.tsx` | 移除 ChatPanel，编辑器全宽 |
| `frontend/src/components/editor/tip-tap-editor.tsx` | 注册 AIBlock、AICommand extension，集成 AIBubbleMenu |
| `frontend/src/components/editor/editor-toolbar.tsx` | 可选：添加 AI 触发按钮 |
| `frontend/src/components/editor/ai-writing-menu.tsx` | 删除（替换为 AIBubbleMenu） |
| `frontend/src/components/chat/*` | 可后续删除，暂时保留 |
| `frontend/src/hooks/use-streaming-chat.ts` | 复用，AI 块使用同一 hook 流式获取回答 |

### 数据模型

```
AIBlock 结构:
{
  type: "aiBlock",
  attrs: {
    mode: "write" | "qa",        // 写作模式 / 知识库问答
    state: "input" | "loading" | "done" | "error",
    conversation: [               // 对话历史
      { role: "user", content: "..." },
      { role: "assistant", content: "...", citations: [...] }
    ]
  }
}
```

### SSE 流式输出复用

复用 `useStreamingChat` hook 的核心逻辑（fetch + SSE reader），AI 块组件使用相同的流式输出模式。

## 文件变更总结

- 新增: 3 个文件 (extensions ×2, component ×1)
- 修改: 3 个文件 (page.tsx, tip-tap-editor.tsx, editor-toolbar.tsx)
- 删除: 1 个文件 (ai-writing-menu.tsx，替换为 AIBubbleMenu)
- 暂留: chat 目录（后续清理）

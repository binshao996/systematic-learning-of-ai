# Notion AI 知识平台 -- 架构详解

> 一个类似 Notion 的文档编辑与 AI 知识库平台。从 0 到 1 完整实现：文档 CRUD、文件上传解析、RAG（检索增强生成）、内嵌 AI 写作助手、SSE 流式对话等全链路功能。本文是项目架构的权威解读。

---

## 系统架构总览

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    Nginx (可选)                       │
                    │              Reverse Proxy / SSL                     │
                    └─────┬──────────────┬──────────────┬─────────────────┘
                          │              │              │
            ┌─────────────▼──┐  ┌────────▼──────┐  ┌───▼─────────────┐
            │  Frontend      │  │  Backend       │  │  Docker 服务     │
            │  Next.js 16    │  │  Bun + Hono    │  │                 │
            │  React 19      │  │  Port: 3001    │  │  PostgreSQL:5432│
            │  Port: 3000    │  │                │  │  Qdrant:6333    │
            └───────┬────────┘  └───────┬────────┘  │  MinIO:9000     │
                    │                   │           └─────────────────┘
                    │                   │
    ┌───────────────▼───────────────────▼──────────────────────────┐
    │                        前端核心模块                             │
    │                                                                │
    │  ┌──────────┐ ┌────────────┐ ┌───────────┐ ┌─────────────┐  │
    │  │TipTap     │ │AIBlock     │ │Editor      │ │AIBubbleMenu │  │
    │  │Editor     │ │(Custom     │ │Toolbar     │ │(浮动菜单)    │  │
    │  │(富文本)    │ │ Node View) │ │(格式化栏)   │ │             │  │
    │  └─────┬─────┘ └─────┬──────┘ └─────┬──────┘ └──────┬──────┘  │
    │        │              │              │               │         │
    │        └──────────────┴──────┬───────┴───────────────┘         │
    │                              │                                  │
    │                    ┌─────────▼──────────┐                       │
    │                    │  streamSSEChat()   │                       │
    │                    │  (共享 SSE 客户端)   │                       │
    │                    └─────────┬──────────┘                       │
    │                              │                                  │
    │                    ┌─────────▼──────────┐                       │
    │                    │  markdownToHtml()  │                       │
    │                    │  (AI 响应渲染)      │                       │
    │                    └────────────────────┘                       │
    └────────────────────────────────────────────────────────────────┘
                    │
                    │  HTTP REST + SSE (POST /api/chat)
                    │
    ┌───────────────▼────────────────────────────────────────────────┐
    │                        后端核心模块                               │
    │                                                                 │
    │  Hono Routes                   RAG Pipeline                    │
    │  ┌──────────────┐         ┌──────────────────┐                 │
    │  │ /api/documents│         │ File Upload      │                 │
    │  │ /api/upload   │────────▶│   ↓ Parser       │                 │
    │  │ /api/chat     │         │   ↓ Chunker      │                 │
    │  │ /api/search   │         │   ↓ Embedder     │                 │
    │  │ /api/feedback │         │   ↓ Indexer      │                 │
    │  │ /api/health   │         └──────────────────┘                 │
    │  └──────────────┘                                              │
    │                              ┌──────────────────┐             │
    │  Chat Route                  │ Query Flow       │             │
    │  ┌─────────────┐             │ User Query       │             │
    │  │ POST /chat   │────────────▶│   ↓ Embed        │             │
    │  │  └─ RAG mode │             │   ↓ Qdrant Search│             │
    │  │  └─ Write    │             │   ↓ Retrieve TopK│             │
    │  │     mode     │             │   ↓ DeepSeek Chat│             │
    │  └─────────────┘             │   ↓ SSE Stream   │             │
    │                              └──────────────────┘             │
    │                                                                 │
    │  外部 AI API                                                    │
    │  ┌──────────────────────────────────────┐                      │
    │  │  DeepSeek API (api.deepseek.com)     │                      │
    │  │  - Chat: deepseek-chat model         │                      │
    │  │  - Embed: jina-embeddings-v3 / bge   │                      │
    │  └──────────────────────────────────────┘                      │
    └────────────────────────────────────────────────────────────────┘
```

---

## 第一章：技术选型与理由

### 1.1 前端技术栈

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| **Next.js** | 16.2.6 | App Router 架构原生支持 Server/Client Components；文件路由约定简单；React Server Components 带来性能优势 |
| **React** | 19.2.4 | 最新稳定版，`use()` hook、Server Components、改进的 hydration 错误提示 |
| **TipTap** | 3.23.1 | 基于 ProseMirror 的无头编辑器框架。定制化能力极强，支持自定义 Node/Extension/Mark，是构建 Notion 式编辑器的不二之选。对比 Slate.js 更成熟，对比 Quill 更灵活 |
| **TailwindCSS** | 4.0 | 原子化 CSS 框架。v4 使用 CSS-first 配置，与 shadcn/ui 深度集成 |
| **shadcn/ui** | 4.7.0 | 复制即拥有（copy-paste）的组件库，基于 Radix UI 原语。不是 npm 依赖，而是源码级复用。提供 Button、Dialog、Skeleton 等基础组件 |
| **@base-ui/react** | 1.4.1 | Radix UI 的继任者，无样式可访问性原语；用于 Dialog/Popover 等交互组件 |
| **Zustand** | 5.0.13 | 轻量级状态管理。比 Redux 简洁，比 Context 性能好。项目中用作编辑器 UI 状态的响应式存储 |
| **sonner** | 2.0.7 | React Toast 通知库，API 极简（`toast.success("message")`），动画优雅 |
| **lucide-react** | 1.14.0 | 高质量 SVG 图标库，tree-shakable，每个图标独立导入 |
| **cmdk** | 1.1.1 | 命令面板（Command Palette）组件，用于搜索弹窗 |

**为什么选择 Next.js App Router 而非 Pages Router？**
- App Router 的 `layout.tsx` 支持持久化布局（侧边栏不随路由切换而重新渲染）
- Server Components 减少客户端 JavaScript 体积
- 文件约定路由（`[docId]/page.tsx`）直观清晰

**为什么选择 TipTap 而非 Slate.js / Quill / Monaco？**
- TipTap 的 Extension 系统允许创建自定义 Node（如 AIBlock），完全控制渲染和交互
- NodeView 使用 React 渲染，与项目技术栈一致
- ProseMirror 底层健壮，支持协同编辑的可扩展性（虽然本项目暂未开启）

### 1.2 后端技术栈

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| **Bun** | latest | Node.js 替代运行时。原生支持 TypeScript、JSX、`.env` 文件；内置测试运行器；启动速度极快（~50ms）；包安装速度比 npm 快 10-30 倍 |
| **Hono** | 4.12.18 | 极轻量 Web 框架。类 Express API 但体积 ~13KB。原生支持 Zod validator 集成、中间件、SSE。比 Express 快，比 Fastify 简洁 |
| **Zod** | 4.4.3 | TypeScript-first schema 验证库。用于 env 变量验证、请求体校验。类型可以从 Schema 推导，无需重复声明 |
| **Drizzle ORM** | 0.45.2 | TypeScript ORM。相比 Prisma：无代码生成步骤、查询更接近 SQL 思维、性能更好。`drizzle-kit` 提供 migration 生成 |
| **PostgreSQL + pgvector** | pg16 | 选择 PostgreSQL 而非 MySQL：pgvector 扩展提供原生向量支持（IVFFlat/HNSW 索引），可以在同一查询中混合结构化过滤和向量相似度搜索 |
| **Qdrant** | latest | 专用向量数据库。虽然 pgvector 能做向量检索，但 Qdrant 在高维向量（1024 维）大规模检索时性能更优（HNSW 索引），且提供更好的过滤和 payload 管理 |
| **DeepSeek API** | - | 国内大模型 API。性价比极高（Chat 约 0.14 元/百万 token）；支持 OpenAI 兼容协议，迁移成本低；中文能力出色 |
| **MinIO** | latest | S3 兼容对象存储。用于存储上传的原始文件（PDF/DOCX/MD）。自部署解决数据主权问题，API 与 AWS S3 完全兼容 |
| **Mammoth** | 1.12.0 | DOCX 解析库，将 Word 文档转为纯文本。比 `officeparser` 更稳定，支持自定义样式映射 |
| **pdf-parse** | 2.4.5 | PDF 文本提取库，基于 Mozilla pdf.js |

**为什么选择 Bun 而非 Node.js？**
- 零配置 TypeScript 执行（无需 ts-node 或 tsx）
- 内置 File I/O、SQLite、Bun.serve() 等 API
- 内置测试框架（`bun test`）
- 与 Node.js 生态兼容（npm 包可直接使用）

**为什么选择 Hono 而非 Express / Fastify？**
- Hono 专为边缘运行时设计，也支持 Bun/Node
- 内置 Zod 校验中间件（`@hono/zod-validator`）
- `c.req.valid("json")` 直接获得类型安全的请求体
- 路由定义方式（链式调用）比 Express 更现代

**为什么选择 Drizzle 而非 Prisma？**
- Drizzle 无代码生成，schema 定义即 TypeScript 代码
- Queries 写法接近纯 SQL，学习曲线平缓
- `migrate` 命令基于差异生成，不依赖 Prisma 的 black-box migration engine
- 对 pgvector 的支持同样优秀

### 1.3 基础设施

| 组件 | 选型理由 |
|------|----------|
| **Docker Compose** | 一键启动 PostgreSQL + Qdrant + MinIO 三个依赖服务。`docker compose up -d` 即完成环境准备 |
| **pgvector/pgvector:pg16** | 包含 pgvector 扩展的 PostgreSQL 16 官方镜像 |
| **qdrant/qdrant:latest** | Qdrant 官方镜像，REST + gRPC 双协议 |

---

## 第二章：数据库设计

### 2.1 ER 图

```
┌──────────────────────────────┐       ┌──────────────────────────────┐
│         documents            │       │           chunks              │
├──────────────────────────────┤       ├──────────────────────────────┤
│ id        UUID PK            │──┐    │ id        UUID PK            │
│ title     TEXT    NOT NULL   │  │    │ doc_id    UUID FK ───────────┘
│ parent_id UUID    (self-ref) │──┘    │ chunk_index INTEGER NOT NULL │
│ content   JSONB   DEFAULT {} │       │ text      TEXT NOT NULL      │
│ created_at TIMESTAMP         │       │ heading_path JSONB           │
│ updated_at TIMESTAMP         │       │ qdrant_point_id UUID         │
└──────────────────────────────┘       │ created_at TIMESTAMP         │
                                       └──────────────────────────────┘

┌──────────────────────────────┐       ┌──────────────────────────────┐
│       chat_sessions          │       │        chat_messages          │
├──────────────────────────────┤       ├──────────────────────────────┤
│ id        UUID PK            │──┐    │ id        UUID PK            │
│ doc_id    UUID FK ───────────┘ │    │ session_id UUID FK ──────────┘
│ title     TEXT                │    │ role      TEXT NOT NULL       │
│ created_at TIMESTAMP          │    │ content   TEXT NOT NULL       │
└──────────────────────────────┘    │ citations JSONB DEFAULT []     │
                                    │ created_at TIMESTAMP           │
                                    └──────────────────────────────┘
```

### 2.2 表设计说明

**documents 表**
- `parent_id` 自引用外键：支持嵌套文档树（当前前端展示为一级扁平列表，但 Schema 预留了层级能力）
- `content` 使用 JSONB：存储 TipTap 编辑器的 ProseMirror JSON 文档结构，灵活存储任意富文本内容
- 不使用分离的 `pages` / `blocks` 模式：简化数据模型，让 TipTap 自行管理块结构

**chunks 表**
- `heading_path` JSONB 数组：记录 chunk 所在的标题路径（如 `["Chapter 1", "Section 1.1"]`），用于检索时提供上下文
- `qdrant_point_id`：关联 Qdrant 中的向量点，用于后续更新和删除

**chat_sessions / chat_messages 表**
- 经典的多轮对话模型
- `citations` JSONB：存储 RAG 检索到的引用来源
- Session 关联到 docId：用户可以在特定文档的上下文中进行对话

---

## 第三章：核心流程详解

### 3.1 文档摄入流程（Ingestion Pipeline）

```
用户上传文件 (PDF/DOCX/MD/TXT)
        │
        ▼
┌───────────────────┐
│  1. Parser        │  mammoth (DOCX) / pdf-parse (PDF) / TextDecoder (MD/TXT)
│  (parser.ts)      │  → 提取纯文本 + 章节结构
└───────┬───────────┘
        │ ParsedDocument { text, sections[], metadata }
        ▼
┌───────────────────┐
│  2. Chunker       │  3 种策略可选：
│  (chunker.ts)     │  - SemanticChunker (默认): 按 Markdown 标题分割，大段落再切
│                   │  - FixedSizeChunker: 固定窗口 (500chars + 50 overlap)
│                   │  - RecursiveChunker: 递归在分隔符上切割 (段落→句子→词→字符)
└───────┬───────────┘
        │ Chunk[] { text, chunkIndex, headingPath, charStart, charEnd }
        ▼
┌───────────────────┐
│  3. Embedder      │  DeepSeek/Jina Embedding API
│  (client.ts)      │  模型: jina-embeddings-v3 (1024 维)
│                   │  批量调取，每批 20 个 chunk
└───────┬───────────┘
        │ number[][]
        ▼
┌───────────────────┐
│  4. Indexer       │  双写策略:
│  (indexer.ts)     │  - PostgreSQL chunks 表 (文本 + 元数据)
│                   │  - Qdrant vector DB (向量 + payload)
│                   │  先删旧数据再写入（幂等重索引）
└───────────────────┘
```

**三种分块策略对比：**

| 策略 | 原理 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|----------|
| Fixed | 固定字符数 + 滑动窗口 | 简单可控，块大小均匀 | 可能在句子/段落中间截断 | 格式不规则的文本 |
| Semantic (默认) | 按 Markdown 标题结构切分 | 保留语义完整性，标题路径提供上下文 | 依赖文档的标题结构 | 结构化文档（MD、技术文档） |
| Recursive | 递归尝试分隔符：`\n\n` → `\n` → `.` → ` ` → 字符 | 不依赖文档格式，通用性强 | 小文本可能过度切分 | 复杂混合文档 |

### 3.2 RAG 查询流程

```
用户输入问题
        │
        ▼
┌───────────────────┐
│  1. Query Embed   │  将问题文本转为 1024 维向量
│  deepseekEmbed()  │  与摄入时使用相同模型确保向量空间对齐
└───────┬───────────┘
        │ queryVector: number[]
        ▼
┌───────────────────┐
│  2. Vector Search │  Qdrant 余弦相似度检索 Top-K (默认 K=5)
│  searchChunks()   │  可选 filter: 限定 docId 范围
└───────┬───────────┘
        │ RetrievedChunk[] { chunkId, docId, text, score, headingPath }
        ▼
┌───────────────────┐
│  3. Prompt 组装   │  将检索到的 chunks 注入 System Prompt
│  generator.ts     │  使用 [chunk:UUID] 标记引用源
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  4. DeepSeek Chat │  SSE 流式返回
│  deepseekChat()   │  temperature=0.3 (保证答案稳定性)
└───────┬───────────┘
        │ SSE stream (data: {...}\n\n)
        ▼
┌───────────────────┐
│  5. 前端渲染       │  streamSSEChat() 逐 token 展示
│  AIBlockView      │  markdownToHtml() 转换格式
│  AIBubbleMenu     │  citation 链接可点击跳转
└───────────────────┘
```

**RAG 的降级策略**（engine.ts 实现）：
当检索步骤抛出异常时（如 Qdrant 不可用），系统自动降级到直接对话模式（无上下文），保证可用性。

### 3.3 AI 内嵌编辑器流程

这是第五阶段的核心功能，将 AI 能力直接嵌入 TipTap 编辑器而非独立面板。整个系统包含三个层面：**触发层**、**交互组件层**、**后端服务层**。

#### 3.3.1 总览：三种 AI 交互方式

```
┌──────────────────────────────────────────────────────────────────┐
│                      触发方式（5 种）                               │
├──────────────┬──────────────┬──────────────┬──────────┬──────────┤
│ 空行按 Space  │ /ai + Enter  │ /aik + Enter │ 工具栏按钮 │ 选中文本  │
│ → AI Write   │ → AI Write   │ → AI Ask(KB) │ 两种均可  │ 弹出菜单  │
└──────┬───────┴──────┬───────┴──────┬───────┴────┬─────┴────┬─────┘
       │              │              │            │          │
       ▼              ▼              ▼            ▼          ▼
┌──────────────────────────┐  ┌────────────────────────────────────┐
│     AIBlock (内联块)       │  │    AIBubbleMenu (浮动菜单)          │
│  ┌────────────────────┐   │  │  ┌────────────────────────────┐   │
│  │ mode: write | qa   │   │  │  │ 选中文本后浮出              │   │
│  │ 输入 → 流式 → 完成  │   │  │  │ 8 个动作可选               │   │
│  │ Keep/Retry/Discard │   │  │  │ 流式预览 → Replace/Insert  │   │
│  │ 支持多轮追问        │   │  │  └────────────────────────────┘   │
│  └────────────────────┘   │  │                                    │
│  数据存储: Node attrs     │  │  数据存储: React state (local)     │
└──────────┬───────────────┘  └────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                  前端共享层: streamSSEChat()                        │
│  lib/stream-client.ts                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ POST /api/chat { message, docId, sessionId, signal }       │  │
│  │ → ReadableStream.getReader()                               │  │
│  │ → 逐行解析 SSE "data: {...}"                                │  │
│  │ → onChunk(fullText, delta) 回调                            │  │
│  │ → 返回完整文本                                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│  被 AIBlockView、AIBubbleMenu、useStreamingChat 三个消费者共用     │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                  后端路由: POST /api/chat                          │
│  routes/chat.ts                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 1. 创建/复用 chat session（存入 PostgreSQL）                  │  │
│  │ 2. 保存 user message                                       │  │
│  │ 3. 判断消息类型:                                            │  │
│  │    isWritingAction(message)?                                │  │
│  │    ├─ YES → deepseekChat() 直接对话（跳过 RAG）              │  │
│  │    │        system: "writing assistant, no citation markers"│  │
│  │    └─ NO  → ragQuery(message, { docId })                    │  │
│  │             → retrieve → generateStream → SSE 流式返回      │  │
│  │ 4. 透传 DeepSeek SSE 响应流                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 AIBlock 组件详解

AIBlock 是一个 TipTap **自定义 Node**（`extensions/ai-block.ts`），通过 React NodeView 渲染。

**状态机与用户操作：**

```
                    ┌─────────────┐
        用户输入      │   input     │ ◀── Continue 按钮
        按 Enter ──▶ │  输入框 +   │     从 done 返回
                    │  Send 按钮   │
                    └──────┬──────┘
                           │ handleSubmit()
                           ▼
                    ┌─────────────┐
                    │  loading    │ ── AbortController 可取消
                    │  流式接收   │    显示闪烁光标/bounce dots
                    └──────┬──────┘
                           │ 成功 / 失败
                           ▼
                    ┌─────────────┐
                    │    done     │     ┌─────────────┐
                    │  Keep       │     │    error     │
                    │  Retry      │     │  显示错误    │
                    │  Discard    │     │  Retry 按钮  │
                    │  Continue   │     └─────────────┘
                    └─────────────┘
```

**keep 操作的核心实现（markdownToHtml + 替换节点）：**
```typescript
// ai-block-view.tsx: handleKeep()
const handleKeep = () => {
  const lastAssistant = conversation.findLast(m => m.role === "assistant");
  const html = markdownToHtml(lastAssistant.content);
  editor.chain().focus()
    .deleteRange({ from: pos, to: pos + nodeSize })  // 删除 AIBlock
    .insertContentAt(pos, html)                       // 插入渲染后的 HTML
    .run();
};
```

**conversation 数据流：**
- AIBlock 的 `conversation: AIConversationEntry[]` 存储在 Node attributes 中
- 每次用户发消息/收到响应，通过 `updateAttributes()` 同步到 ProseMirror 状态
- 支持多轮对话：done 状态后点 Continue → 回到 input → 继续提问

#### 3.3.3 AIBubbleMenu 组件详解

AIBubbleMenu 是一个**浮动 React 组件**（非 TipTap Node），选中文本时出现。

**8 个 AI 动作对应的消息协议：**

| 用户操作 | 发送消息格式 | 后端处理 |
|----------|-------------|---------|
| Improve writing | `[improve] 选中文本...` | deepseekChat（跳过 RAG） |
| Rewrite professionally | `[rewrite] 选中文本...` | deepseekChat（跳过 RAG） |
| Summarize | `[summarize] 选中文本...` | deepseekChat（跳过 RAG） |
| Translate to Chinese | `[translate-zh] 选中文本...` | deepseekChat（跳过 RAG） |
| Translate to English | `[translate-en] 选中文本...` | deepseekChat（跳过 RAG） |
| Make longer | `[longer] 选中文本...` | deepseekChat（跳过 RAG） |
| Make shorter | `[shorter] 选中文本...` | deepseekChat（跳过 RAG） |
| Change tone | `[tone] 选中文本...` | deepseekChat（跳过 RAG） |

**交互流程：**
```
1. 用户选中文本 → mouseup 事件 → setAiMenuPos({ top, left })
2. AIBubbleMenu 渲染在选中文本下方
3. 用户选择动作 → handleAction(actionId)
4. 调用 streamSSEChat({ message: `[actionId] ${selectedText}`, onChunk })
5. 流式显示预览（markdownToHtml 渲染）
6. 用户选择 Replace 或 Insert below
   ├─ Replace: editor.chain().focus().insertContent(html).run()
   └─ Insert below: editor.chain().focus().insertContent(`\n${html}`).run()
```

#### 3.3.4 键盘快捷键实现

在 `tip-tap-editor.tsx` 的 `editorProps.handleKeyDown` 中处理：

```typescript
handleKeyDown: (view, event) => {
  const { $from, empty } = view.state.selection;
  const node = $from.parent;
  const nodeText = node.textContent;

  // /ai 或 /aik → 替换当前段落为 AIBlock
  if ((event.key === " " || event.key === "Enter") && empty
      && node.type.name === "paragraph") {
    if (nodeText === "/ai" || nodeText === "/aik") {
      const mode = nodeText === "/aik" ? "qa" : "write";
      const aiNode = view.state.schema.nodes.aiBlock.create(
        { mode, state: "input", conversation: [] });
      view.dispatch(view.state.tr.replaceWith(
        $from.before(), $from.after(), aiNode));
      return true;
    }

    // 空段落按 Space → AI Write
    if (event.key === " " && nodeText.trim() === ""
        && node.childCount === 0) {
      const aiNode = view.state.schema.nodes.aiBlock.create(
        { mode: "write", state: "input", conversation: [] });
      view.dispatch(view.state.tr.replaceWith(
        $from.before(), $from.after(), aiNode));
      return true;
    }
  }
  return false;
}
```

#### 3.3.5 优化点汇总

以下是第五阶段实施过程中积累的关键优化：

| # | 优化点 | 问题 | 解决方案 |
|---|--------|------|---------|
| 1 | **共享 SSE 客户端** | AIBlockView、AIBubbleMenu、useStreamingChat 各自实现 SSE | 提取 `streamSSEChat()` 到 `lib/stream-client.ts`，三个消费者共用 |
| 2 | **写作动作跳过 RAG** | 写作动作不需要知识库检索，RAG prompt 的 `[chunk:xxx]` 引用标记污染输出 | 后端 `isWritingAction()` 检测 `[action-id]` 前缀，直接走 deepseekChat |
| 3 | **Markdown 渲染** | AI 返回原始 Markdown 无法在 TipTap 中显示样式 | 实现 `markdownToHtml()` 支持标题/列表/代码块/粗斜体/链接/引用 |
| 4 | **`[chunk:xxx]` 残留清理** | RAG prompt 要求 AI 输出引用标记，但写作场景不需要 | 前端 `cleanText.replace(/\[chunk:[^\]]+\]/g, "")` + 后端写作动作跳过 RAG 双保险 |
| 5 | **中文输入法 Enter 误触** | IME 组合输入时按 Enter 选择候选词，不应发送消息 | `onCompositionStart/End` 追踪 `isComposing`，handleKeyDown 中检查 |
| 6 | **AIBlock 自动聚焦** | TipTap NodeView DOM 挂载时机晚于 React useEffect | 双重 `requestAnimationFrame` 后再 `inputRef.current?.focus()` |
| 7 | **工具栏按钮修复** | `@base-ui/react` Button 组件拦截 `onMouseDown` 事件，导致 TipTap `chain().focus()` 失败 | 替换为原生 `<button>` + `onMouseDown` + `e.preventDefault()` |
| 8 | **编辑器内容样式** | Tailwind preflight 重置了 h1-h6/ul/ol/code 等标签样式，`@tailwindcss/typography` 插件 CSS 未生成 | 在 `globals.css` 中为 `.ProseMirror` 添加显式样式（标题/列表/代码块/引用/表格等） |
| 9 | **AbortController 支持** | AI 请求没有取消机制 | `streamSSEChat` 接受 `signal` 参数，`AbortController` 传递给 `fetch()` |
| 10 | **降级策略** | Qdrant 不可用时 RAG 完全失败 | `ragQuery()` 自动降级为 `deepseekChat()` 直接对话 |

### 3.4 SSE 流式通信

```
Client (streamSSEChat)                    Server (POST /api/chat)
    │                                            │
    │  POST { message, docId, sessionId }        │
    │ ──────────────────────────────────────────▶ │
    │                                            │ 判断消息类型
    │                                            │ ├─ [action] → direct chat
    │                                            │ └─ 普通 → ragQuery()
    │                                            │
    │  HTTP 200, Content-Type: text/event-stream │
    │ ◀────────────────────────────────────────── │
    │                                            │
    │  data: {"choices":[{"delta":{"content":"你好"}}]}
    │ ◀── SSE chunk ───────────────────────────── │
    │  data: {"choices":[{"delta":{"content":"，"}}}]}
    │ ◀── SSE chunk ───────────────────────────── │
    │  ...                                       │
    │  data: [DONE]                              │
    │ ◀── End of stream ──────────────────────── │
    │                                            │
    ▼                                            ▼
  ReadableStream.getReader()               deepseekChat({stream:true})
  逐行解析 "data: {...}"                    透传 DeepSeek SSE 响应
```

**关键技术点：**
- `streamSSEChat()` 通过 `ReadableStream` API 读取 SSE 响应，兼容 AIBlockView、AIBubbleMenu、useStreamingChat 三种消费场景
- 前端使用 `signal: AbortSignal` 支持取消请求
- 后端直接将 DeepSeek 的 SSE 响应流转发（透传模式），不做额外序列化

---

## 第四章：五个实施阶段

### 阶段一：基础架构（Foundation）

**目标**：搭建项目骨架，实现最基本的文档编辑功能。

**完成内容：**
1. Docker Compose 环境：PostgreSQL、Qdrant、MinIO 三个服务
2. 后端 Hono 应用骨架：CORS、错误处理、健康检查
3. 数据库 Schema：documents 表（UUID 主键、title、parentId、content JSONB）
4. 文档 CRUD API：`GET/POST /api/documents`、`GET/PATCH/DELETE /api/documents/:id`
5. 前端 Next.js App Router 布局：侧边栏（DocTree）+ 主编辑区
6. TipTap 编辑器集成：StarterKit（基础格式）、Placeholder 扩展
7. 文档标题内联编辑 + 内容防抖自动保存（1 秒 debounce）

**关键决策：**
- 选用 App Router 的 layout 模式，侧边栏作为 `(main)/layout.tsx`，不参与路由切换重渲染
- 编辑器内容存储为 TipTap JSON（而非 HTML/Markdown），保证富文本结构的完整性
- 文档树采用一级扁平列表（parentId 预留但前端未实现嵌套）

### 阶段二：RAG 管道（RAG Pipeline）

**目标**：实现文件上传 → 解析 → 分块 → 向量化 → 索引的完整摄入链路。

**完成内容：**
1. 文件上传 API（`POST /api/upload`）：multipart 接收，创建 document 记录，触发摄入管道
2. Parser 服务：支持 PDF（pdf-parse）、DOCX（mammoth）、MD/TXT（原生）三种格式
3. Chunker 服务：实现 3 种分块策略（Fixed / Semantic / Recursive），默认 Semantic
4. Embedding 服务：DeepSeek/Jina API 1024 维向量生成，批量处理 + 超时控制
5. Indexer 服务：双写 PostgreSQL chunks 表 + Qdrant vector DB，幂等重索引
6. Pipeline 编排器：串联 解析→分块→向量化→索引 全流程
7. Qdrant 操作封装：ensureCollection、upsertChunks、searchChunks、deleteDocChunks
8. 前端 UploadDialog 组件：支持拖拽和点击上传

**关键决策：**
- 选用 SemanticChunker 作为默认策略：项目主要处理技术文档，Markdown 标题结构提供最好的语义边界
- 双写 PostgreSQL + Qdrant：PostgreSQL 存储原始文本用于巡检和回溯，Qdrant 存储向量用于快速检索
- BATCH_SIZE=20：平衡 API 调用次数和单次请求体大小

### 阶段三：对话与搜索（Chat & Search）

**目标**：实现 RAG 对话和混合搜索功能。

**完成内容：**
1. Chat Session 管理：创建/查询会话，关联到文档
2. Chat Message 持久化：用户和 AI 消息完整记录到数据库
3. SSE 流式对话端点（`POST /api/chat`）：
   - 区分写作模式和 RAG 模式（通过 `[action]` 前缀）
   - RAG 模式：检索 → 组装 Prompt → DeepSeek Chat → SSE 流
   - 写作模式：直接 DeepSeek Chat → SSE 流
4. Retriever 服务：查询向量化 → Qdrant 搜索 → 结果映射
5. Generator 服务：上下文组装（`[chunk:UUID]` 标记）、System Prompt 模板
6. Citation 提取：从 AI 响应中解析 `[chunk:UUID]` 标记，匹配到具体文本片段
7. Hybrid Search API（`GET /api/search`）：统一的搜索入口
8. 反馈系统（`POST /api/feedback`）：点赞/点踩 + 评论（下行时日志 + 截断内容）
9. RAG Engine 降级策略：检索失败时 fallback 到直接对话
10. 前端 SearchDialog 组件：命令面板式搜索，结果高亮展示
11. 前端 useStreamingChat Hook：管理 SSE 流式接收状态
12. 前端 CitationLink 组件：可点击的知识源引用

### 阶段四：工程完善（Polish）

**目标**：提升代码质量和系统可靠性。

**完成内容：**
1. 环境变量 Zod Schema 验证：所有变量提供默认值，新开发者 copy `.env.example` 即可启动
2. 错误边界组件（ErrorBoundary）：捕获渲染错误，提供友好的重试界面
3. 编辑器加载骨架屏：提高感知性能
4. RAG 评估框架：
   - EvalCase 定义：query + expectedAnswer
   - 指标：Faithfulness（忠实度）、Relevance（相关度）、Latency（延迟）、Tokens
   - Evaluator：自动运行测试用例并生成汇总报告
5. 后端测试：chunker 单元测试 + evaluator 集成测试
6. UUID 格式校验：路由参数统一校验，防止无效 UUID 传入数据库查询
7. 文档树刷新机制：创建/删除/上传后自动刷新列表

### 阶段五：AI 内嵌写作助理（AI Writing Assistant -- 当前阶段）

**目标**：将 AI 能力从独立面板深度整合进编辑器，实现 Notion AI 式的内嵌体验。

**完成内容：**
1. **AIBlock 自定义 TipTap Node**：
   - 原子节点（atom:true），使用 ReactNodeViewRenderer 渲染
   - 两种模式：write（AI 写作）、qa（知识库问答）
   - 四种状态：input → loading → done / error
   - 多轮对话历史展示（conversation 数组）
   - 流式文本实时渲染 + Markdown 转换
   - Keep/Retry/Discard/Continue 操作栏
   - IME 输入法兼容（onCompositionStart/End）

2. **AICommand 自定义 TipTap Extension**：
   - `insertAIBlock` 命令：插入 AI 写作块
   - `insertAIQA` 命令：插入知识库问答块

3. **AIBubbleMenu 浮动菜单**：
   - 选中文本后自动弹出（监听 mouseup 事件）
   - 8 个 AI 动作：改进写作、专业重写、摘要、中英翻译、加长、缩短、改变语气
   - 流式展示 AI 响应
   - Replace / Insert below / Cancel 三种处理方式
   - 视口边界检测（防止菜单溢出屏幕）

4. **键盘快捷键**：
   - 空段落按 Space → 触发 AI Write 块
   - 输入 `/ai` + Space/Enter → 触发 AI Write 块
   - 输入 `/aik` + Space/Enter → 触发 Ask Knowledge Base 块

5. **EditorToolbar 升级**：
   - 新增 "Ask AI"（蓝色）和 "Ask Knowledge Base"（紫色）两个按钮
   - 点击直接在编辑器光标处插入 AIBlock

6. **共享模块抽取**：
   - `lib/stream-client.ts`：核心 SSE 流式客户端，被 AIBlockView、AIBubbleMenu、useStreamingChat 共同复用
   - `lib/markdown.ts`：Markdown 到 HTML 转换器，处理标题、粗斜体、列表、代码块、链接、图片、引用块

7. **编辑器改进**：
   - `handleKeyDown` 处理 /ai /aik 指令识别和 AIBlock 替换
   - `sanitizeContent()` 防御性处理空/无效 JSON 内容
   - `immediatelyRender: false` 避免 SSR hydration 不匹配

---

## 第五章：项目文件结构

```
notion-ai/
│
├── docker-compose.yml              # PostgreSQL + Qdrant + MinIO 服务编排
├── .env.example                    # 环境变量模板（含默认值）
├── README.md                       # 项目说明与启动指南
│
├── backend/                        # Bun + Hono 后端
│   ├── package.json
│   ├── drizzle.config.ts           # Drizzle Kit 配置
│   ├── drizzle/                    # 数据库迁移文件
│   └── src/
│       ├── index.ts                # 应用入口：Hono app + Bun.serve()
│       ├── env.ts                  # 环境变量 Zod Schema 验证
│       ├── db/
│       │   ├── connection.ts       # Drizzle + postgres.js 连接
│       │   └── schema.ts           # 5 张表 Schema 定义
│       ├── routes/
│       │   ├── documents.ts        # 文档 CRUD (POST/GET/PATCH/DELETE)
│       │   ├── upload.ts           # 文件上传 + 触发摄入管道
│       │   ├── chat.ts             # SSE 流式对话（RAG + Writing 双模式）
│       │   ├── search.ts           # 知识库搜索
│       │   └── feedback.ts         # 对话反馈（赞/踩）
│       ├── services/
│       │   ├── deepseek/
│       │   │   └── client.ts       # Chat API + Embedding API 封装
│       │   ├── ingestion/
│       │   │   ├── parser.ts       # 文件解析器 (PDF/DOCX/MD/TXT)
│       │   │   ├── chunker.ts      # 3 种分块策略 (Fixed/Semantic/Recursive)
│       │   │   ├── indexer.ts      # 向量索引 (双写 PG + Qdrant)
│       │   │   └── pipeline.ts     # 摄入流程编排
│       │   ├── rag/
│       │   │   ├── retriever.ts    # 查询向量化 + Qdrant 检索
│       │   │   ├── generator.ts    # Prompt 组装 + DeepSeek 对话
│       │   │   └── engine.ts       # RAG 查询入口 + 降级策略
│       │   ├── eval/
│       │   │   └── evaluator.ts    # RAG 评估框架
│       │   └── qdrant.ts           # Qdrant CRUD 封装
│       └── lib/
│           ├── prompts.ts          # System Prompt 模板 + 写作 Prompt
│           └── citation.ts         # Citation 提取逻辑
│
├── frontend/                       # Next.js 16 + React 19 前端
│   ├── package.json
│   ├── next.config.ts
│   └── src/
│       ├── app/
│       │   ├── layout.tsx          # 根布局：Inter 字体 + Toaster
│       │   ├── globals.css         # Tailwind 全局样式
│       │   └── (main)/
│       │       ├── layout.tsx      # 主布局：侧边栏 + 主内容区
│       │       └── [docId]/
│       │           └── page.tsx    # 文档页面：标题编辑 + TipTapEditor
│       ├── components/
│       │   ├── editor/
│       │   │   ├── tip-tap-editor.tsx   # 主编辑器组件（核心）
│       │   │   ├── editor-toolbar.tsx   # 格式化工具栏 + AI 按钮
│       │   │   ├── ai-block-view.tsx    # AIBlock Node 的 React 渲染视图
│       │   │   └── ai-bubble-menu.tsx   # 选中文本浮动 AI 菜单
│       │   ├── sidebar/
│       │   │   ├── doc-tree.tsx         # 文档树列表
│       │   │   ├── doc-tree-item.tsx    # 单个文档项（含右键删除菜单）
│       │   │   └── new-doc-button.tsx   # 新建文档按钮
│       │   ├── chat/
│       │   │   └── chat-message.tsx     # 聊天消息气泡
│       │   ├── search/
│       │   │   └── search-dialog.tsx    # 命令面板搜索
│       │   ├── upload/
│       │   │   └── upload-dialog.tsx    # 文件上传弹窗
│       │   └── ui/                      # shadcn/ui 基础组件
│       │       ├── button.tsx
│       │       ├── dialog.tsx
│       │       ├── input.tsx
│       │       └── skeleton.tsx
│       ├── extensions/
│       │   ├── ai-block.ts          # AIBlock 自定义 TipTap Node
│       │   └── ai-command.ts        # AICommand 自定义 TipTap Extension
│       ├── hooks/
│       │   ├── use-debounce.ts      # 防抖 Hook（编辑器自动保存）
│       │   └── use-streaming-chat.ts # SSE 流式对话状态管理
│       ├── lib/
│       │   ├── stream-client.ts     # 共享 SSE 客户端
│       │   ├── markdown.ts          # Markdown → HTML 转换器
│       │   ├── api-client.ts        # HTTP API 封装
│       │   └── utils.ts             # 通用工具函数
│       └── types/
│           └── index.ts             # 共享类型定义
│
├── learning/                        # 学习笔记目录
│   ├── 00-notion-ai-架构详解.md     ← 本文档
│   ├── 01-rag-深度解析.md
│   ├── 02-deepseek-api-实践.md
│   ├── 03-qdrant-实践.md
│   ├── 04-文档解析.md
│   └── 05-项目复盘.md
│
└── docs/
    └── rag-guide.md                # RAG 实现指南
```

---

## 第六章：环境搭建与启动

### 6.1 前置条件

- **Bun** >= 1.0（后端运行时）
- **Node.js** >= 20（前端运行时）
- **Docker** + Docker Compose（基础设施）
- **DeepSeek API Key**（AI 能力）

### 6.2 启动步骤

```bash
# 1. 克隆项目
cd notion-ai

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 3. 启动基础设施（PostgreSQL + Qdrant + MinIO）
docker compose up -d

# 4. 初始化数据库迁移（后端）
cd backend
bun install
bun db:generate   # 生成 SQL 迁移文件
bun db:migrate    # 执行迁移

# 5. 启动后端（端口 3001）
bun dev

# 6. 安装前端依赖并启动（新终端，端口 3000）
cd ../frontend
bun install
bun dev
```

### 6.3 验证

```bash
# 健康检查
curl http://localhost:3001/api/health
# → {"status":"ok"}

# Qdrant 集合验证
curl http://localhost:6333/collections
# → {"result":{"collections":[...]}}

# 打开前端
open http://localhost:3000
```

### 6.4 使用流程

1. 打开浏览器访问 `http://localhost:3000`
2. 点击侧边栏 **"+"** 按钮创建新文档，或点击上传按钮导入 PDF/DOCX/MD 文件
3. 在编辑器中输入内容，自动保存（1 秒防抖）
4. **AI 写作**：空行按 Space 或输入 `/ai` 触发 AI 写作块；或选中文本使用浮动菜单
5. **知识库问答**：输入 `/aik` 触发 Ask Knowledge Base 块，针对已上传文档提问
6. 点击工具栏 "Ask AI" / "Ask Knowledge Base" 按钮快速插入 AI 块

---

## 第七章：设计原则与架构总结

### 7.1 核心设计原则

1. **渐进增强（Progressive Enhancement）**
   阶段一到五逐步叠加功能，每个阶段都是可运行的完整系统。基础编辑 → 知识摄入 → 对话交互 → 工程打磨 → AI 深度整合。

2. **关注点分离（Separation of Concerns）**
   - 前端：编辑器（TipTap）、AI 交互（AIBlock/BubbleMenu）、数据流（Zustand）
   - 后端：路由（Hono Routes）、服务（Services）、数据访问（Drizzle）
   - 基础设施：Docker Compose 隔离，每个服务单一职责

3. **失败降级（Graceful Degradation）**
   - RAG 引擎检索失败时自动降级为直接对话
   - 编辑器保存失败时 Toast 提醒但不阻塞用户操作
   - AI 请求失败时进入 error 状态，允许 Retry

4. **代码复用（DRY）**
   - `streamSSEChat()` 被 AIBlockView、AIBubbleMenu、useStreamingChat 三处共享
   - `markdownToHtml()` 统一 AI 响应渲染逻辑
   - `AIConversationEntry` 类型在 AIBlock Node 和 AIBlockView 之间共享

5. **类型安全（Type Safety）**
   - Zod Schema 验证所有环境变量和请求体
   - TypeScript 严格模式贯穿前后端
   - Drizzle ORM 提供完整的查询类型推导

### 7.2 技术亮点

- **TipTap 自定义 Node**：通过 `Node.create()` + `ReactNodeViewRenderer()` 将 AI 交互完全嵌入编辑器文档树，支持撤销/重做、序列化/反序列化
- **SSE 透传架构**：后端直接将 DeepSeek 的 SSE 流转发到前端，零额外序列化开销
- **双写索引策略**：PostgreSQL 存文本元数据，Qdrant 存向量，兼顾检索性能和事务一致性
- **多策略 Chunker**：根据文档特征选择最合适的分块策略，默认 Semantic 适配技术文档场景
- **零配置环境**：所有 env 变量提供合理的默认值，新开发者复制 `.env.example` 即可启动

### 7.3 下一步方向

- **协同编辑**：引入 Y.js + TipTap Collaboration 实现多人实时编辑
- **更细粒度的 AI 交互**：选中单段文本直接改写，而非替换整个选区
- **权限系统**：用户认证 + 文档级别的读写权限控制
- **更多文件格式**：支持 PPT、Excel、网页 URL 等摄入源
- **Agent 模式**：AI 可以主动搜索知识库、调用外部工具
- **评估体系强化**：引入 RAGAS 等标准评估框架，持续监控检索质量

# Agent Forge — 架构详解

> 一个可视化的 AI Agent 构建与编排平台。支持通过画布拖拽搭建多 Agent 工作流、Agent 测试聊天、工具调用、SSE 流式输出。本项目是完整的技术实现记录。

---

## 系统架构总览

```
                         ┌──────────────────────────────────────────┐
                         │            Bun + Hono (Port 3002)        │
                         │                                          │
                         │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
                         │  │ Agents   │  │Workflows │  │ Tools  │ │
                         │  │ Route    │  │ Route    │  │ Route  │ │
                         │  └────┬─────┘  └────┬─────┘  └───┬────┘ │
                         │       │             │            │       │
                         │  ┌────▼─────────────▼────────────▼─────┐ │
                         │  │          Services Layer              │ │
                         │  │                                      │ │
                         │  │  runAgent()      runWorkflow()       │ │
                         │  │  chatCompletion()  executeTool()     │ │
                         │  │  emitSSE()        seedBuiltinTools() │ │
                         │  └────────────────┬─────────────────────┘ │
                         │                   │                       │
                         │          ┌────────▼────────┐              │
                         │          │  Drizzle ORM     │              │
                         │          │  PostgreSQL:5433 │              │
                         │          └─────────────────┘              │
                         └──────────────────────────────────────────┘
                              │                        │
                    REST + SSE                        DB
                              │                        │
                         ┌────▼────────────────────────▼──────────┐
                         │           Frontend                       │
                         │         Next.js 16 + React 19            │
                         │         Port: 3000                       │
                         │                                          │
                         │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
                         │  │ Agents   │ │Workflows │ │  Runs   │ │
                         │  │ CRUD +   │ │ReactFlow │ │History  │ │
                         │  │ TestChat │ │Editor    │ │Detail   │ │
                         │  └──────────┘ └──────────┘ └─────────┘ │
                         │                                          │
                         │  ┌─────────────────────────────────────┐ │
                         │  │          Shared Components           │ │
                         │  │                                      │ │
                         │  │  MarkdownContent (react-markdown)    │ │
                         │  │  ToolPicker   AgentForm              │ │
                         │  │  NodePanel    RunConsole             │ │
                         │  │  useAgentRun  useWorkflowRun         │ │
                         │  └─────────────────────────────────────┘ │
                         └──────────────────────────────────────────┘
```

---

## 第一章：技术选型与理由

### 1.1 后端技术栈

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| **Bun** | latest | 原生 TypeScript 执行，零配置。`Bun.serve()` 内置 HTTP 服务器，启动 < 100ms |
| **Hono** | 4.x | 极轻量 Web 框架（~13KB），内置 Zod validator、CORS 中间件、SSE 支持 |
| **Zod** | 3.x | TypeScript-first schema 验证。`zValidator` 与 Hono 深度集成 |
| **Drizzle ORM** | 0.x | SQL-like 查询语法。无代码生成步骤。`jsonb` 支持适合存 nodes/edges |
| **PostgreSQL** | 16 | 关系数据（agents/workflows/runs/tools）的持久化存储。JSONB 存复杂结构 |
| **DeepSeek API** | - | 高性价比大模型 API。OpenAI 兼容协议。Chat + Tool Call 支持 |
| **LangChain LangGraph** | latest | StateGraph 工作流引擎。管理 Agent 节点编排、条件路由、状态传递 |

**为什么选择 LangGraph？**
- `StateGraph` 提供 START/END 抽象 + 条件边 + 常规边，完美匹配可视化工作流
- `Annotation.Root` 定义共享状态，内建 `reducer` 机制合并各节点输出
- 不依赖 LangChain 其他组件，可以只使用 graph 编排能力

**为什么选择 Hono 而非 Express / Fastify？**
- Hono 的 `stream()` 方法与 Bun 的 `ReadableStream` 无缝集成，SSE 实现自然
- 路由定义方式链式调用，代码结构清晰
- `@hono/zod-validator` 一行完成请求体验证 + 类型推导

### 1.2 前端技术栈

| 技术 | 版本 | 选型理由 |
|------|------|----------|
| **Next.js** | 16.2.6 | App Router 架构。Server Components 减少客户端 JS |
| **React** | 19.2.4 | 最新稳定版。`use()` hook、Server Components |
| **ReactFlow** | 11.11.4 | 专业可视化工作流编辑器。内置拖拽、连线、节点选择、缩放平移 |
| **TailwindCSS** | 4.3 | 原子化 CSS。v4 CSS-first 配置，`@theme inline` 自定义变量 |
| **shadcn/ui** | 4.7.0 | 复制即拥有的组件库，源码级复用 |
| **Zustand** | 5.0.13 | 轻量级状态管理，适合 UI 临时状态 |
| **lucide-react** | 1.14.0 | 高质量 SVG 图标库，tree-shakable |
| **react-markdown** | 9.x | React 渲染 Markdown，支持 GFM（表格、任务列表等） |
| **remark-gfm** | 4.x | GFM 扩展（表格、删除线、任务列表） |
| **sonner** | 2.x | Toast 通知库，API 极简 |

**为什么选择 ReactFlow 而非自建画布？**
- 内置 Handle 系统（target/source），连线逻辑成熟
- 支持自定义 Node 组件，每种节点类型独立渲染
- MiniMap、Controls、Background 开箱即用
- 拖入节点、连线交互、删除键支持已内置

---

## 第二章：数据库设计

### 2.1 表结构

```sql
-- Agent 定义
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  system_prompt TEXT NOT NULL,
  model         TEXT DEFAULT 'deepseek-chat',
  temperature   REAL DEFAULT 0.3,
  max_tokens    INTEGER DEFAULT 2048,
  tool_ids      JSONB DEFAULT '[]',
  created_at    TIMESTAMP DEFAULT now(),
  updated_at    TIMESTAMP DEFAULT now()
);

-- 工具定义（内置 + 自定义）
CREATE TABLE tools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  description   TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'builtin',
  input_schema  JSONB NOT NULL,
  config        JSONB DEFAULT '{}',
  enabled       BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT now()
);

-- 工作流定义
CREATE TABLE workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  nodes         JSONB NOT NULL DEFAULT '[]',
  edges         JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMP DEFAULT now(),
  updated_at    TIMESTAMP DEFAULT now()
);

-- 运行历史
CREATE TABLE runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID REFERENCES workflows(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  input         TEXT NOT NULL,
  output        TEXT,
  trace_events  JSONB DEFAULT '[]',
  started_at    TIMESTAMP,
  completed_at  TIMESTAMP,
  created_at    TIMESTAMP DEFAULT now()
);
```

### 2.2 核心数据结构

```
WorkflowNode (JSONB 存储在 workflows.nodes):
  {
    id: string              -- 节点唯一 ID
    type: "start"|"end"|"agent"|"code"  -- 节点类型
    agentId?: string        -- Agent 节点绑定的 Agent ID
    label: string           -- 显示名称
    position: {x, y}        -- 画布坐标
    config?: {}             -- 扩展配置
    content?: string        -- Code 节点的 JS 代码
    inputSchema?: {}        -- Start 节点的输入 schema
    outputSchema?: {}       -- End 节点的输出 schema
  }

WorkflowEdge (JSONB 存储在 workflows.edges):
  {
    id: string              -- 边唯一 ID
    source: string          -- 源节点 ID
    target: string          -- 目标节点 ID
    label?: string          -- 显示标签
    condition?: {keyword}   -- 条件路由（含 keyword 则走此边）
  }
```

### 2.3 表关系

```
agents  ◄────  tools (通过 agent.tool_ids JSONB 数组关联)
  │
  │ (workflows.nodes 中 type="agent" 的 node.agentId)
  ▼
workflows ──────► runs (一对多，一个工作流多次运行)
```

---

## 第三章：后端核心实现

### 3.1 SSE 流式输出机制

```
Client (EventSource/fetch)                  Server (Hono + Bun)
      │                                          │
      │  POST /api/agents/:id/run                │
      │  body: { message: "..." }                │
      │ ────────────────────────────────────────▶│
      │                                          │ 创建 ReadableStream
      │                                          │ controller = new ReadableStream()
      │  HTTP 200                                │
      │  Content-Type: text/event-stream         │
      │ ◀────────────────────────────────────────│
      │                                          │
      │  event: agent_start                      │ runAgent(agentId, msg, controller)
      │  data: {"type":"agent_start", ...}       │   emitSSE(controller, event)
      │ ◀────────────────────────────────────────│     controller.enqueue(encoded)
      │                                          │
      │  event: thinking                         │   chatCompletion(messages, tools)
      │  data: {"type":"thinking","content":...} │   → DeepSeek API
      │ ◀────────────────────────────────────────│
      │                                          │
      │  event: agent_output                     │
      │  data: {"type":"agent_output", ...}      │
      │ ◀────────────────────────────────────────│
      │                                          │
      │  event: done                             │ controller.close()
      │ ◀────────────────────────────────────────│
      │                                          │
      │  stream closed                           │
```

**关键技术点：**

1. **Hono + Bun ReadableStream 集成：**
```typescript
// backend/src/routes/agents.ts
agentsRoute.post("/:id/run", async (c) => {
  const { message } = await c.req.json();
  const stream = new ReadableStream({
    start(controller) {
      runAgent(agentId, message, controller);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
```

2. **emitSSE 编码：**
```typescript
// backend/src/services/agent/stream.ts
export function emitSSE(
  controller: ReadableStreamDefaultController,
  event: SSEEvent
) {
  try {
    const data = JSON.stringify(event);
    controller.enqueue(
      new TextEncoder().encode(`event: ${event.type}\ndata: ${data}\n\n`)
    );
  } catch {
    // Controller 已关闭（客户端断开或超时），静默忽略
  }
}
```

3. **Bun 超时配置：**
```typescript
// backend/src/index.ts
Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 120,  // SSE 长连接，默认 10s 不够
});
```

### 3.2 Agent 运行时 (runAgent)

```
runAgent(agentId, userInput, controller)
  │
  │ 1. 加载 Agent 配置 (DB)
  │    ├── system_prompt
  │    ├── temperature, maxTokens
  │    └── toolIds → tools (ToolDefinition[])
  │
  │ 2. 构建 messages = [system, user]
  │
  │ 3. 循环 (最多 10 轮)
  │    │
  │    ├── chatCompletion(messages, toolDefs, options)
  │    │   └── POST DeepSeek API
  │    │       ├── Temperature: agent.temperature (默认 0.3)
  │    │       └── Max Tokens: agent.maxTokens (默认 2048)
  │    │
  │    ├── 有 content → emitSSE("thinking", content)
  │    │
  │    ├── 有 tool_calls?
  │    │   ├── YES:
  │    │   │   ├── emitSSE("tool_call", {toolName, toolInput})
  │    │   │   ├── executeTool(name, args)
  │    │   │   ├── emitSSE("tool_result", {toolOutput, latencyMs})
  │    │   │   └── push tool result → messages, 继续循环
  │    │   │
  │    │   └── NO:
  │    │       ├── emitSSE("agent_output", content)
  │    │       └── break
  │    │
  │ 4. emitSSE("done")
  │
  │ 5. finally: controller.close()
```

### 3.3 工作流运行时 (runWorkflow)

```
runWorkflow(wf, input, controller)
  │
  │ 1. 创建 run 记录 (status: "running")
  │
  │ 2. 解析 nodes, edges
  │
  │ 3. 构建 LangGraph StateGraph
  │    │
  │    ├── 对每个 node，按 type 创建节点函数：
  │    │
  │    │   type="start":
  │    │     return { agentOutputs: {[id]: state.input} }
  │    │     → 将用户输入作为输出传给下游
  │    │
  │    │   type="end":
  │    │     return { agentOutputs: {[id]: join(所有输出)} }
  │    │     → 收集所有上游输出
  │    │
  │    │   type="code":
  │    │     new Function("state", node.content)(state)
  │    │     → 执行 JS 代码，返回结果
  │    │
  │    │   type="agent":  (默认)
  │    │     → 调用 createAgentNodeFn(agentId)
  │    │     → LLM 推理 + Tool Call 循环
  │    │
  │ 4. 边处理
  │    ├── 入度为 0 的节点 ← 连接自 START
  │    ├── 条件边: evaluateCondition(output, {keyword})
  │    ├── 常规边: source → target
  │    └── 出度为 0 的节点 → 连接至 END
  │
  │ 5. graph.compile().invoke({input})
  │
  │ 6. 更新 run 状态 (completed / failed)
  │
  │ 7. finally: controller.close()
```

**条件路由实现：**
```typescript
function evaluateCondition(
  output: string,
  condition: Record<string, unknown>
): boolean {
  const keyword = condition.keyword as string;
  if (!keyword) return true;
  return output.toLowerCase().includes(keyword.toLowerCase());
}
```

### 3.4 工具系统

```
Tool 生命周期:
  1. 种子数据 (server 启动时)
     seedBuiltinTools() → DB 插入 3 个内置工具
  
  2. Agent 配置
     agent.toolIds = ["tool-uuid-1", "tool-uuid-2"]
  
  3. 运行时
     toolDefs = ToolDefinition[]
       {type:"function", function:{name, description, parameters}}
  
  4. 模型返回 tool_calls
     executeTool(tc.name, tc.arguments)
       ├── "calculator" → eval() 执行数学表达式
       ├── "file_reader" → 读取已上传文件
       └── "web_search" → (TODO: ) 联网搜索
```

内置工具注册：

| 工具名 | 用途 | 实现 |
|--------|------|------|
| `calculator` | 数学表达式求值 | `new Function("return " + expr)()` 包裹 try/catch |
| `file_reader` | 读取已上传文件内容 | 从文件系统读取 |
| `web_search` | 搜索网络信息 | 预留接口 |

### 3.5 API 路由总览

```
/api/health          GET    → 健康检查
/api/agents          GET    → 列出所有 Agent
/api/agents          POST   → 创建 Agent (zValidator: agentSchema)
/api/agents/:id      GET    → 获取单个 Agent
/api/agents/:id      PATCH  → 更新 Agent (部分更新)
/api/agents/:id      DELETE → 删除 Agent
/api/agents/:id/run  POST   → 运行 Agent (SSE 流式响应)
/api/tools           GET    → 列出所有工具
/api/workflows       GET    → 列出所有工作流
/api/workflows       POST   → 创建工作流
/api/workflows/:id   GET    → 获取单个工作流
/api/workflows/:id   PATCH  → 更新工作流
/api/workflows/:id   DELETE → 删除工作流
/api/workflows/:id/run POST → 运行工作流 (SSE 流式响应)
/api/runs            GET    → 列出最近 50 次运行
/api/runs/:id        GET    → 运行详情 (含 traceEvents)
```

---

## 第四章：前端核心实现

### 4.1 组件树

```
App (layout.tsx)
├── /agents                    — Agent 列表页
│   └── AgentCard[]            — Agent 卡片网格
│
├── /agents/[id]               — Agent 编辑页
│   ├── AgentForm              — 配置表单 (name, prompt, model, temperature...)
│   ├── ToolPicker             — 工具选择器 (勾选启用)
│   └── TestChat               — 测试聊天面板
│       ├── ThinkingCard[]     — 思考过程 (可折叠)
│       │   └── MarkdownContent — react-markdown 渲染
│       ├── EventCard[]        — tool_call / tool_result 显示
│       └── MarkdownContent    — agent_output 最终回复
│
├── /workflows                 — 工作流列表页
│
├── /workflows/[id]            — 工作流编辑器 (核心)
│   ├── WorkflowToolbar        — 顶栏 (名称、保存、运行)
│   ├── AgentPanel             — 左侧面板
│   │   ├── Start/End 节点     — 拖入画布
│   │   └── Agent 列表         — 拖入画布
│   ├── ReactFlow Canvas       — 中间画布
│   │   ├── StartNode          — 绿色圆形节点
│   │   ├── EndNode            — 红色方形节点
│   │   ├── AgentNode          — Agent 节点 (Bot 图标)
│   │   └── CodeNode           — 代码节点 (Code2 图标)
│   └── RunConsole             — 右侧运行面板 (可拖拽宽度)
│       ├── 输入 textarea
│       ├── Run/Stop 按钮
│       └── EventCard[]        — 运行事件 + MarkdownContent 渲染
│
└── /runs/[id]                 — 运行历史详情页
    └── TimelineCard[]         — 时间线展示
        └── MarkdownContent    — 统一 Markdown 渲染
```

### 4.2 SSE 客户端实现

```typescript
// frontend/src/hooks/use-agent-run.ts
const res = await fetch(`${API_URL}/api/agents/${agentId}/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message }),
  signal: controller.signal,           // AbortController 用于停止
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";           // 保留未完成行

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const event = JSON.parse(line.slice(6));
      // 按 event.type 更新 React state
      if (event.type === "done") { ... }
      else if (event.type === "error") { ... }
      else { setState(s => ({...s, events: [...s.events, event]})) }
    }
  }
}
```

**关键细节：**
- `buffer` 机制保证跨 chunk 的不完整 SSE 行不丢失
- 每次事件到达即更新 `events` state，React 逐条渲染新卡片
- `AbortController` 支持用户随时停止执行

### 4.3 Markdown 渲染

```typescript
// frontend/src/components/markdown-content.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

**CSS 样式要点（globals.css）：**
- `h1`/`h2` 有底部 border + margin 分隔
- `pre` 深色背景（`oklch(0.15)`）+ 圆角 + 等宽字体
- 行内 `code` 琥珀色背景（`oklch(0.97 0.02 85)`）
- `ul`/`ol` 带 `list-style-type` + 左缩进
- `table` 带边框 + 表头背景色 + 交替行色
- `blockquote` 左边框 + italic + 灰色

### 4.4 Workflow 编辑器核心流程

```
用户操作                    Editor State                 DB
───────                    ────────────                  ──
拖入 Start 节点    → setNodes([...nodes, startNode])
拖入 Agent 节点    → setNodes([...nodes, agentNode])
拖入 End 节点      → setNodes([...nodes, endNode])
连线 Start→Agent   → onConnect(conn) → addEdge()
连线 Agent→End     → onConnect(conn) → addEdge()
                          │
点击 Save           → 序列化 nodes + edges      → POST/PATCH
                          ├── id, type, agentId    /api/workflows
                          ├── label, position
                          └── content
                          │
输入 + 点击 Run     → 构建 input                  → POST
                          │                       /api/workflows/:id/run
                          │                              │
                    useWorkflowRun() ←────────────SSE events─────────
                          │
                    setState({events:[], currentNodeId})
                          │
                    activeNodes 更新高亮
                    RunConsole 逐条显示事件
                          │
                    最终: events[done]
```

### 4.5 Thinking 折叠逻辑

```typescript
function ThinkingCard({ event, done }: { event: TraceEvent; done: boolean }) {
  const [collapsed, setCollapsed] = useState(done);

  useEffect(() => {
    setCollapsed(done);   // done=true 时自动折叠所有 thinking
  }, [done]);

  return (
    <div>
      <button onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight /> : <ChevronDown />}
        <Brain />
        Thinking
        {collapsed && <预览前 80 字符>}
      </button>
      {!collapsed && <MarkdownContent content={content} />}
    </div>
  );
}
```

---

## 第五章：关键问题与解决方案

### 5.1 Bun SSE 超时 (idleTimeout)

**问题：** Agent 调用 DeepSeek API 耗时超过 10 秒，Bun 默认 `idleTimeout: 10` 断开 SSE 连接，导致 `ERR_INVALID_STATE: Controller already closed`。

**解决：**
1. `Bun.serve({ idleTimeout: 120 })` — 提高超时到 120 秒
2. `emitSSE` 内部 try/catch — 静默处理 controller 已关闭
3. `controller.close()` 在 finally 中 try/catch — 防止 double-close

### 5.2 SSE 事件类型扩展

**问题：** Workflow 引入 Start/End/Code 节点后，需要新事件类型区分 node 级别和 agent 级别。

**解决：** 新增 `node_start`、`node_output` 事件类型，与原有 `agent_start`、`agent_output` 并存。前端统一处理两类事件的高亮和渲染。

### 5.3 Workflow 状态传递

**问题：** 多节点顺序执行时，下游 Agent 需要获取上游输出作为上下文。

**解决：** LangGraph `Annotation.Root` + `reducer` 机制：
```typescript
const WorkflowState = Annotation.Root({
  agentOutputs: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
});

// 下游 Agent 的 userMessage:
const contextParts = Object.entries(state.agentOutputs)
  .map(([id, output]) => `[${id}]: ${output}`);
contextParts.push(`User task: ${state.input}`);
```

### 5.4 拖拽多类型节点

**问题：** ReactFlow 需要区分 Agent 拖拽（携带 Agent 数据）和内置节点拖拽（Start/End/Code）。

**解决：** 使用不同 MIME type：
- Agent 拖入：`e.dataTransfer.setData("application/agent", JSON.stringify(agent))`
- 内置节点拖入：`e.dataTransfer.setData("application/nodetype", "start")`

`onDrop` 中依次检查两种 data type。

### 5.5 后端 TypeScript 类型收窄

**问题：** 内联 SSE 事件对象的 `type` 字段被 TypeScript 推断为 `string` 而非字面量类型，导致类型检查失败。

**解决：** 显式类型标注：
```typescript
const evt: SSEEvent = {
  type: "node_start",
  step,
  agentId: node.id,
  agentName: node.label,
};
emitSSE(controller, evt);
```

---

## 第六章：运行与部署

### 6.1 本地开发

```bash
# 后端
cd agent-forge/backend
cp .env.example .env   # 编辑 DEEPSEEK_API_KEY
bun install
bun run dev            # http://localhost:3002

# 前端
cd agent-forge/frontend
cp .env.local.example .env.local
npm install
npm run dev            # http://localhost:3000
```

### 6.2 数据库

```bash
# 启动 PostgreSQL
docker run -d --name agentforge-pg \
  -e POSTGRES_USER=agentforge \
  -e POSTGRES_PASSWORD=agentforgepass \
  -e POSTGRES_DB=agent_forge \
  -p 5433:5432 \
  pgvector/pgvector:pg16

# 初始化表结构
cd backend && bun run db:migrate

# 种子数据（内置工具）
# 服务启动时自动执行 seedBuiltinTools()
```

### 6.3 环境变量

**后端 (agent-forge/backend/.env)：**
```
PORT=3002
DATABASE_URL=postgres://agentforge:agentforgepass@localhost:5433/agent_forge
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

**前端 (agent-forge/frontend/.env.local)：**
```
NEXT_PUBLIC_API_URL=http://localhost:3002
```

---

## 第七章：代码目录结构

```
agent-forge/
├── backend/
│   └── src/
│       ├── index.ts                      # Bun.serve + 路由注册
│       ├── env.ts                        # Zod env schema
│       ├── db/
│       │   ├── connection.ts             # Drizzle + pg 连接
│       │   └── schema.ts                 # 表定义
│       ├── routes/
│       │   ├── agents.ts                 # Agent CRUD + /run SSE
│       │   ├── tools.ts                  # 工具列表
│       │   ├── workflows.ts              # Workflow CRUD + /run SSE
│       │   └── runs.ts                   # 运行记录
│       └── services/
│           ├── llm/
│           │   └── client.ts             # chatCompletion (DeepSeek)
│           ├── agent/
│           │   ├── runtime.ts            # runAgent()
│           │   └── stream.ts             # emitSSE + SSEEvent 类型
│           ├── workflow/
│           │   └── runner.ts             # runWorkflow() + LangGraph
│           └── tools/
│               ├── registry.ts           # seedBuiltinTools()
│               └── execute.ts            # executeTool()
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── layout.tsx                # 根布局
│       │   ├── page.tsx                  # 首页
│       │   ├── agents/
│       │   │   ├── page.tsx              # Agent 列表
│       │   │   └── [id]/page.tsx         # Agent 编辑页
│       │   ├── workflows/
│       │   │   ├── page.tsx              # Workflow 列表
│       │   │   └── [id]/page.tsx         # Workflow 编辑器
│       │   └── runs/
│       │       ├── page.tsx              # 运行历史列表
│       │       └── [id]/page.tsx         # 运行详情
│       ├── components/
│       │   ├── markdown-content.tsx      # 共享 Markdown 渲染
│       │   ├── agents/
│       │   │   ├── agent-card.tsx
│       │   │   ├── agent-form.tsx
│       │   │   ├── test-chat.tsx         # 测试聊天 (ThinkingCard + Markdown)
│       │   │   └── tool-picker.tsx
│       │   └── workflow/
│       │       ├── agent-node.tsx        # Agent 节点 (ReactFlow Node)
│       │       ├── StartNode.tsx         # Start 节点
│       │       ├── EndNode.tsx           # End 节点
│       │       ├── CodeNode.tsx          # Code 节点
│       │       ├── agent-panel.tsx       # 左侧面板 (节点 + Agent 列表)
│       │       ├── workflow-toolbar.tsx  # 顶部工具栏
│       │       └── run-console.tsx       # 右侧运行面板 (可拖拽)
│       ├── hooks/
│       │   ├── use-agent-run.ts          # useAgentRun (SSE 解析)
│       │   └── use-workflow-run.ts       # useWorkflowRun (SSE + currentNodeId)
│       ├── lib/
│       │   ├── api-client.ts             # apiFetch 封装
│       │   └── utils.ts                  # cn() 工具函数
│       └── types/
│           └── index.ts                  # Agent, Tool, Workflow, Run, TraceEvent
│
└── learning/
    └── 00-agent-forge-架构详解.md        # 本文
```

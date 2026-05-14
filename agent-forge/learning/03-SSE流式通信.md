# SSE 流式通信 — 深度解析

> Server-Sent Events (SSE) 是 Agent 流式输出的核心技术。本文从协议层、服务端推送、客户端解析、错误处理、超时配置到前后端完整数据流，逐层拆解。

---

## 1. SSE 协议基础

### 1.1 为什么是 SSE 而非 WebSocket？

| 特性 | SSE | WebSocket |
|------|-----|-----------|
| 方向 | 单向（服务端 → 客户端） | 双向 |
| 协议 | HTTP | 独立协议（ws://） |
| 自动重连 | 内置 `EventSource` 自动重连 | 需手动实现 |
| 复杂度 | 极低 | 较高 |
| 适用场景 | 流式输出、进度推送 | 实时聊天、协作编辑 |
| 浏览器支持 | 所有现代浏览器 | 所有现代浏览器 |

**Agent 场景选择 SSE 的理由：**
- Agent 响应是单向流（服务端推送 → 客户端展示）
- 不需要双向通信（客户端只发一次请求）
- SSE 自动重连、HTTP/2 多路复用
- 实现更简单

### 1.2 SSE 消息格式

```
event: agent_start
data: {"type":"agent_start","step":1,"agentId":"abc","agentName":"测试Agent"}

event: thinking
data: {"type":"thinking","step":1,"content":"让我先分析这个问题..."}

event: tool_call
data: {"type":"tool_call","step":1,"toolName":"calculator","toolInput":"1+2*3"}

event: tool_result
data: {"type":"tool_result","step":1,"toolName":"calculator","toolOutput":"7","latencyMs":5}

event: agent_output
data: {"type":"agent_output","step":1,"content":"计算结果是 7"}

event: done
data: {"type":"done","step":1,"latencyMs":1500}
```

每条消息由 `event:` 和 `data:` 两行组成，以空行分隔。`event:` 是可选的（默认 `message`），`data:` 是 JSON 负载。

---

## 2. 服务端实现

### 2.1 Hono Route 创建 SSE Stream

```typescript
// backend/src/routes/agents.ts

agentsRoute.post("/:id/run", async (c) => {
  const agentId = c.req.param("id");
  const { message } = await c.req.json();

  // 创建 ReadableStream — Bun 原生支持
  const stream = new ReadableStream({
    start(controller) {
      // controller 是 ReadableStreamDefaultController
      // 在 start 中启动异步 Agent 执行
      runAgent(agentId, message, controller);
    },
  });

  // 返回 Response，浏览器识别为 SSE
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
```

**关键设计：**
- `new ReadableStream({ start(controller) { ... } })` — Bun 原生 API
- `start()` 立即返回（同步），异步工作通过 controller 推送
- Response headers 声明 `text/event-stream`，浏览器识别为 SSE

### 2.2 emitSSE 编码函数

```typescript
// backend/src/services/agent/stream.ts

export interface SSEEvent {
  type: SSEEventType;
  step: number;
  content?: string;
  agentId?: string;
  agentName?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  latencyMs?: number;
  tokenUsage?: { prompt: number; completion: number };
}

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
    // controller 已关闭（客户端断开 / Bun 超时），静默忽略
  }
}
```

**编码规则：**
1. `event:` 行 = 事件类型名
2. `data:` 行 = JSON 序列化的事件负载
3. `\n\n` = 消息结束
4. try/catch 保护：controller 关闭后 enqueue 会抛异常

### 2.3 事件类型体系

```typescript
export type SSEEventType =
  | "agent_start"     // Agent 开始执行 (单 Agent 模式)
  | "thinking"        // 模型推理内容
  | "tool_call"       // 工具调用请求
  | "tool_result"     // 工具调用结果
  | "agent_output"    // Agent 最终输出 (单 Agent 模式)
  | "node_start"      // 工作流节点开始
  | "node_output"     // 工作流节点输出
  | "error"           // 错误
  | "done";           // 流结束
```

**事件类型使用场景：**

```
单 Agent 模式 (runAgent):
  agent_start → thinking → [tool_call → tool_result]* → agent_output → done

工作流模式 (runWorkflow):
  node_start → node_output → agent_start → agent_output → node_output → done
```

### 2.4 生命周期管理

```typescript
export async function runAgent(
  agentId: string,
  userInput: string,
  controller: ReadableStreamDefaultController,
) {
  try {
    // ... Agent 执行逻辑 ...
    emitSSE(controller, { type: "done", step, latencyMs });

  } catch (err) {
    emitSSE(controller, {
      type: "error",
      step,
      content: err instanceof Error ? err.message : "Agent execution failed",
    });
    emitSSE(controller, { type: "done", step });

  } finally {
    try {
      controller.close();    // try/catch 防止 double-close
    } catch {
      // 已关闭（超时或客户端断开），忽略
    }
  }
}
```

**关键防护：**
- `finally` 确保 controller 总是关闭
- try/catch 防止 Bun 超时关闭后再次 close 抛异常
- error 事件 + done 事件确保客户端能正常结束流

---

## 3. 客户端实现

### 3.1 useAgentRun Hook

```typescript
// frontend/src/hooks/use-agent-run.ts

export function useAgentRun() {
  const [state, setState] = useState<RunState>({
    running: false,
    events: [],
    done: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (agentId: string, message: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ running: true, events: [], done: false, error: null });

    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,         // ← AbortController 用于停止
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const reader = res.body!.getReader();  // ← ReadableStream reader
      const decoder = new TextDecoder();
      let buffer = "";                        // ← 跨 chunk 缓冲区

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";          // ← 保留不完整行

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const event = JSON.parse(data);

              if (event.type === "done") {
                setState((s) => ({ ...s, done: true, running: false }));
              } else if (event.type === "error") {
                setState((s) => ({
                  ...s,
                  error: event.content || "Unknown error",
                  done: true,
                  running: false,
                }));
              } else {
                setState((s) => ({
                  ...s,
                  events: [...s.events, event],
                }));
              }
            } catch {
              // JSON 解析失败，跳过
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((s) => ({
          ...s,
          error: (err as Error).message,
          running: false,
          done: true,
        }));
      }
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();       // ← 取消 fetch，停止流
    setState((s) => ({ ...s, running: false }));
  }, []);

  return { ...state, run, stop };
}
```

### 3.2 Buffer 机制详解

SSE 消息可能跨两个 chunk 边界。buffer 保证不丢失跨边界数据：

```
Chunk 1: "event: thinking\ndata: {\"type\":\"thinking\",\"content\":\"分析中"
Chunk 2: "...\"}\n\nevent: agent_output\n..."

处理流程:
  Chunk 1 到达:
    buffer = "event: thinking\ndata: {\"type\":\"thinking\",\"content\":\"分析中"
    lines = ["event: thinking", "data: {\"type\":\"thinking\",\"content\":\"分析中"]
    buffer = "data: {\"type\":\"thinking\",\"content\":\"分析中"  ← pop() 保留
    
  Chunk 2 到达:
    buffer = "data: {\"type\":\"thinking\",\"content\":\"分析中...\"}\n\nevent: agent_output\n..."
    lines = ["data: {\"type\":\"thinking\",\"content\":\"分析中...\"}", "", "event: agent_output", "..."]
    → 完整解析两条事件
```

### 3.3 AbortController 停止机制

```typescript
// 用户点击 Stop 按钮
const stop = useCallback(() => {
  abortRef.current?.abort();    // 取消正在进行的 fetch
  setState((s) => ({ ...s, running: false }));
}, []);

// fetch 中捕获 AbortError
} catch (err) {
  if ((err as Error).name !== "AbortError") {
    // 只对非中止错误处理
    setState((s) => ({ ...s, error: (err as Error).message, ... }));
  }
}
```

---

## 4. Bun 超时问题

### 4.1 问题：默认 idleTimeout 10s

```
Bun.serve 默认 idleTimeout = 10 秒

Agent 调用 DeepSeek API 耗时 15 秒:
  0s → 请求到达
  1s → 开始 DeepSeek 调用
  10s → Bun 断开连接 (idleTimeout 触发)
  15s → DeepSeek 返回 → emitSSE → controller 已关闭 → ERR_INVALID_STATE
```

### 4.2 解决方案

```typescript
// backend/src/index.ts
Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 120,    // ← 提高到 120 秒
});
```

配合 `emitSSE` 和 `controller.close()` 的 try/catch 保护，形成三道防线：

| 防线 | 位置 | 作用 |
|------|------|------|
| `idleTimeout: 120` | Bun.serve | 减少超时发生概率 |
| `emitSSE` try/catch | stream.ts | 超时后静默丢弃事件 |
| `controller.close()` try/catch | runtime.ts | 防止 double-close 崩溃 |

---

## 5. 前端事件消费

### 5.1 两种消费模式

```
Test Chat (单 Agent):
  useAgentRun → events[] → EventCard (ThinkingCard + MarkdownContent)

Workflow Console:
  useWorkflowRun → events[] + currentNodeId → RunConsole + Canvas 高亮
```

### 5.2 useWorkflowRun 特殊处理

```typescript
// frontend/src/hooks/use-workflow-run.ts

// 与 useAgentRun 的差异：跟踪 currentNodeId
if (event.type === "agent_start" || event.type === "node_start") {
  setState((s) => ({
    ...s,
    events: [...s.events, event],
    currentNodeId: event.agentId,     // ← 用于画布高亮
  }));
} else if (event.type === "agent_output" || event.type === "node_output") {
  setState((s) => ({ ...s, events: [...s.events, event] }));
}
```

前端画布根据 `currentNodeId` 实时高亮：

```typescript
const activeNodes = nodes.map((n) => {
  const isRunning = running && (
    n.data.agentId === currentNodeId || n.id === currentNodeId
  );
  return { ...n, data: { ...n.data, isRunning } };
});
```

---

## 6. 数据流完整链路

```
┌──────────┐    POST /api/agents/:id/run     ┌──────────────┐
│ Browser  │ ───────────────────────────────▶│  Hono Route  │
│          │                                  │              │
│ fetch()  │ ◀── Response (text/event-stream) │  new         │
│          │                                  │  Readable    │
│ reader   │    event: agent_start            │  Stream({    │
│  .read() │ ◀── data: {...}                  │   start(c) { │
│          │                                  │    runAgent( │
│ buffer   │    event: thinking               │     id, msg, │
│  .split  │ ◀── data: {...}                  │     c);      │
│  .parse  │                                  │   }          │
│          │    event: agent_output            │  })          │
│ setState │ ◀── data: {...}                  │              │
│          │                                  │              │
│  React   │    event: done                   │              │
│   render │ ◀── data: {...}                  │              │
│          │                                  │              │
│          │    stream closed                 │ controller.  │
│          │                                  │   close()    │
└──────────┘                                  └──────────────┘
```

---

## 7. 总结

```
SSE 流式通信 = ReadableStream + text/event-stream + 客户端 buffer 解析

三层防护:
  1. Bun idleTimeout: 120s — 防止长连接被误杀
  2. emitSSE try/catch — 静默处理连接断开
  3. controller.close() try/catch — 防止 double-close

客户端关键:
  1. res.body.getReader() — ReadableStream 读取
  2. buffer + split("\n") + pop() — 跨 chunk 行缓冲
  3. AbortController — 用户停止执行
  4. event.type 路由 — done/error/normal 三种状态
```

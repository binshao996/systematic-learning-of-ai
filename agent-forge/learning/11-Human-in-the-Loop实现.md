# Human-in-the-Loop 实现

> 基于 LangGraph interrupt/Command/MemorySaver 机制 + SSE 流式事件 + ReactFlow 可配置节点 + 前端双模式输入表单，从图暂停-恢复原理、checkpointer 跨请求状态、buildGraph 重构、resume 端点设计到 HumanInputNode 交互，完整拆解人机协同实现。

---

## 1. 概述

### 1.1 什么是 Human-in-the-Loop

```
普通工作流:
  Start → Agent → End        全程自动，无人工干预

Human-in-the-Loop:
  Start → Agent → Human Input → End
                    ↑
              人工审核/补充信息后才继续
```

### 1.2 核心能力

```
1. 暂停 — 工作流到达 Human Input 节点时自动暂停
2. 提问 — 向用户展示预设问题（prompt）
3. 等待 — 持久化状态，等待用户响应
4. 恢复 — 用户提交响应后，工作流从暂停点继续
5. 多类型输入 — 文本输入、批准/拒绝
```

---

## 2. LangGraph 暂停/恢复机制

### 2.1 interrupt() API

```typescript
import { interrupt } from "@langchain/langgraph";

// 在节点函数中调用 interrupt()
graph.addNode("human_review", (state) => {
  // 1. 发送 SSE 事件通知前端
  emitSSE(controller, {
    type: "human_input_required",
    step, agentId: node.id, prompt, inputType, runId,
  });

  // 2. 暂停图执行，等待外部恢复
  const humanResponse = interrupt({
    type: "human_input",
    nodeId: node.id,
    prompt: "Please review this output",
    inputType: "text",
  });
  // ↑ 抛出 GraphInterrupt，图在此暂停
  // ↓ 恢复后，humanResponse 是用户提交的值

  // 3. 处理用户响应
  emitSSE(controller, {
    type: "node_output",
    content: humanResponse,
  });
  return { agentOutputs: { [node.id]: humanResponse } };
});
```

### 2.2 interrupt() 内部实现

```typescript
// @langchain/langgraph 源码（interrupt.d.ts）
export declare function interrupt<T = unknown>(value: T): T;
```

```
interrupt(value) 的执行流程:

  第一次调用（暂停）:
    → LangGraph 保存当前状态到 Checkpointer
    → 抛出 GraphInterrupt 异常
    → 调用方 catch 异常，持久化 "awaiting_input" 状态

  恢复调用:
    → 调用方 invoke(Command({ resume: "user's response" }), { thread_id })
    → LangGraph 从 Checkpointer 恢复状态
    → 重新执行节点函数
    → interrupt() 返回 resume 值（不再抛异常）
    → 节点函数继续执行
```

### 2.3 Command 恢复

```typescript
import { Command } from "@langchain/langgraph";

// 恢复时创建 Command 对象，传入用户响应
const resumeCmd = new Command({ resume: humanResponse });

// 用相同的 thread_id 继续执行
const result = await compiled.invoke(resumeCmd, {
  configurable: { thread_id: runId },
});
```

关键：`thread_id` 必须与初始 invoke 相同，Checkpointer 靠它关联状态。

---

## 3. MemorySaver 跨请求状态

### 3.1 为什么需要 Checkpointer

```
HTTP 请求模型:
  请求 1 (run) → 暂停 → 请求结束
  请求 2 (resume) → 恢复 → 请求结束

两次请求之间的时间间隔可能是几秒到几分钟。
Checkpointer 在这段时间内保存图状态。
```

### 3.2 模块级 MemorySaver

```typescript
// backend/src/services/workflow/runner.ts

// 模块级 — 同一个实例存活于整个服务进程
const checkpointer = new MemorySaver();
```

```
为什么是模块级？

  ❌ 函数内创建:
     async function runWorkflow() {
       const checkpointer = new MemorySaver();  // 函数返回后 GC
       graph.compile({ checkpointer });
     }
     // resume 时 checkpointer 已销毁 → 状态丢失

  ✅ 模块级:
     const checkpointer = new MemorySaver();        // 进程生命周期
     async function runWorkflow() {
       graph.compile({ checkpointer });
     }
     async function resumeRun() {
       graph.compile({ checkpointer });  // 同一实例，状态还在
     }
```

### 3.3 MemorySaver vs 持久化

```
MemorySaver:
  ✅ 实现简单，零配置
  ✅ 适合单用户开发工具
  ❌ 服务重启后状态丢失
  ❌ 不支持多实例部署

生产环境可替换为:
  - SqliteSaver (SQLite 持久化)
  - PostgresSaver (PostgreSQL 持久化)
  - RedisSaver (Redis，多实例共享)
```

---

## 4. buildGraph 重构

### 4.1 重构动机

```
重构前:
  runWorkflow() 内部写好完整的图构建逻辑（150+ 行）
  resumeRun()  需要完全相同的图结构才能恢复

  问题: 代码重复，两边需要保持同步

重构后:
  buildGraph() 提取为独立函数
  runWorkflow() → buildGraph(graph, nodes, edges, ...)
  resumeRun()   → buildGraph(graph, nodes, edges, ...)
  图结构只有一份定义
```

### 4.2 重构前后对比

```
重构前:
  runWorkflow() {
    const graph = new StateGraph(WorkflowState);
    // 150 行节点添加和边连接逻辑
    graph.addNode(...)
    graph.addEdge(...)
    graph.compile().invoke(...)
  }

  resumeRun() {
    const graph = new StateGraph(WorkflowState);
    // 又一遍 150 行相同逻辑
    graph.addNode(...)
    graph.addEdge(...)
    graph.compile({ checkpointer }).invoke(Command(...))
  }

重构后:
  buildGraph(graph, nodes, edges, controller, logEvent, runId?) {
    // 150 行，一处定义
  }

  runWorkflow() {
    const graph = new StateGraph(WorkflowState);
    buildGraph(graph, nodes, edges, controller, logEvent, runId);
    graph.compile({ checkpointer }).invoke(...)
  }

  resumeRun() {
    const graph = new StateGraph(WorkflowState);
    buildGraph(graph, nodes, edges, controller, logEvent, runId);
    graph.compile({ checkpointer }).invoke(Command(...))
  }
```

### 4.3 buildGraph 函数签名

```typescript
function buildGraph(
  graph: any,                                              // StateGraph 实例
  nodes: WorkflowNodeData[],                               // 工作流节点
  edges: WorkflowEdgeData[],                               // 工作流边
  controller: ReadableStreamDefaultController,             // SSE 控制器
  logEvent: (e: Record<string, unknown> | SSEEvent) => void, // 事件记录
  runId?: string,                                          // 用于关联 human_input_required 事件
) {
  // 5 种节点类型: start, end, agent, code, human_input
  // 边分析: entry nodes 检测、条件边路由、终端连接
  // 并行检测: entryNodes.length > 1 → parallel_start/end
}
```

---

## 5. Node 类型总结

### 5.1 五种节点对比

```
┌─────────────┬──────────────────┬──────────────┬─────────────────┐
│ 类型         │ 输入             │ 处理          │ 输出            │
├─────────────┼──────────────────┼──────────────┼─────────────────┤
│ start       │ state.input      │ 透传          │ 原始输入        │
│ agent       │ 前序 outputs +   │ LLM 循环     │ Agent 回复      │
│             │ state.input      │ (10 次最大)  │                 │
│ code        │ 完整 state       │ new Function │ 代码执行结果    │
│ human_input │ 前序 outputs     │ interrupt()  │ 用户响应文本    │
│ end         │ agentOutputs     │ .join('\n\n')│ 合并文本        │
└─────────────┴──────────────────┴──────────────┴─────────────────┘
```

### 5.2 human_input 节点详情

```typescript
// buildGraph() 中的 human_input 处理
} else if (node.type === "human_input") {
  graph.addNode(node.id, (state: typeof WorkflowState.State) => {
    const step = state.executionLog.length + 1;

    // 从节点配置中读取 prompt 和 inputType
    const prompt = node.content || "Please provide input";
    const inputType = (node.config?.inputType as string) || "text";

    // 发送 human_input_required SSE 事件
    const evt: SSEEvent = {
      type: "human_input_required",
      step, agentId: node.id, agentName: node.label,
      prompt, inputType, runId,
    };
    emitSSE(controller, evt);
    logEvent(evt);

    // 暂停 — 这里抛出 GraphInterrupt
    const humanResponse = interrupt({
      type: "human_input", nodeId: node.id, prompt, inputType
    });

    // 恢复后 — 发送 node_output 事件
    const responseText = typeof humanResponse === "string"
      ? humanResponse : JSON.stringify(humanResponse);

    const outEvt: SSEEvent = {
      type: "node_output", step: step + 1,
      agentId: node.id, agentName: node.label, content: responseText,
    };
    emitSSE(controller, outEvt);
    logEvent(outEvt);

    // 用户响应作为该节点的输出
    return {
      agentOutputs: { [node.id]: responseText },
      executionLog: [{ nodeId: node.id, agentName: node.label, output: responseText }],
    };
  });
}
```

---

## 6. runWorkflow 中的 GraphInterrupt 处理

### 6.1 异常捕获

```typescript
export async function runWorkflow(wf, input, controller) {
  const [run] = await db.insert(runs).values({
    status: "running",
    input,
    traceEvents: [],
    // ...
  }).returning();
  const runId = run.id;

  try {
    const graph = new StateGraph(WorkflowState);
    buildGraph(graph, nodes, edges, controller, logEvent, runId);

    // 用 checkpointer 编译，传入 thread_id
    const compiled = graph.compile({ checkpointer });
    const result = await compiled.invoke(
      { input, agentOutputs: {}, executionLog: [] },
      { configurable: { thread_id: runId } },
    );

    // 正常完成
    await db.update(runs).set({
      status: "completed",
      output: finalOutput,
    }).where(eq(runs.id, runId));

    emitSSE(controller, { type: "done", step: nodes.length });

  } catch (err: any) {
    // ← 关键：区分 GraphInterrupt 和真正的错误
    if (err?.name === "GraphInterrupt") {
      await db.update(runs).set({
        status: "awaiting_input",   // ← 等待用户输入
        traceEvents: allEvents,
      }).where(eq(runs.id, runId));
      emitSSE(controller, { type: "done", step: 0 });

    } else {
      // 真正的错误
      await db.update(runs).set({
        status: "failed",
        output: errorMsg,
      }).where(eq(runs.id, runId));
      emitSSE(controller, { type: "error", content: errorMsg });
      emitSSE(controller, { type: "done", step: 0 });
    }
  }
}
```

### 6.2 状态流转

```
        ┌─────────────┐
        │   running   │  ← 开始执行
        └──────┬──────┘
               │
       ┌───────┴────────┐
       │                │
   正常完成         GraphInterrupt
       │                │
       ▼                ▼
  ┌─────────┐   ┌────────────────┐
  │completed│   │ awaiting_input │ ← 等待用户响应
  └─────────┘   └───────┬────────┘
                         │
                   POST /runs/:id/human-input
                         │
                         ▼
                  ┌─────────────┐
                  │   running   │ ← resume 后重新开始
                  └──────┬──────┘
                         │
                    ┌────┴────┐
                    │         │
                    ▼         ▼
               completed   failed
```

---

## 7. Resume 端点

### 7.1 路由设计

```typescript
// backend/src/routes/workflows.ts
workflowsRoute.post("/runs/:runId/human-input", async (c) => {
  const runId = c.req.param("runId");
  const { response } = await c.req.json();

  const stream = new ReadableStream({
    start(controller) {
      resumeRun(runId, response, controller);
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

### 7.2 resumeRun 函数

```typescript
export async function resumeRun(runId, humanResponse, controller) {
  // 1. 加载 run 和 workflow
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, run.workflowId));

  // 2. 从 run.traceEvents 恢复已有事件
  const allEvents = run.traceEvents || [];
  const logEvent = (event) => {
    allEvents.push(event);
    db.update(runs).set({ traceEvents: allEvents }).where(eq(runs.id, runId));
  };

  try {
    await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId));

    // 3. 重建相同的图结构（复用 buildGraph）
    const graph = new StateGraph(WorkflowState);
    buildGraph(graph, nodes, edges, controller, logEvent, runId);

    // 4. 用 Command({ resume }) 恢复执行
    const compiled = graph.compile({ checkpointer });
    const resumeCmd = new Command({ resume: humanResponse });
    const result = await compiled.invoke(resumeCmd, {
      configurable: { thread_id: runId },  // ← 相同 thread_id
    });

    // 5. 正常完成
    await db.update(runs).set({ status: "completed", output: finalOutput });
    emitSSE(controller, { type: "done" });

  } catch (err) {
    if (err?.name === "GraphInterrupt") {
      // 再次暂停 — 支持多个 human_input 节点
      await db.update(runs).set({ status: "awaiting_input" });
    } else {
      await db.update(runs).set({ status: "failed" });
    }
  }
}
```

---

## 8. 前端交互

### 8.1 HumanInputNode 组件

```typescript
// frontend/src/components/workflow/HumanInputNode.tsx

// 双行显示：标题 + 可编辑 prompt
// 双击 prompt → textarea 编辑
// 点击类型标签 → 切换 text / approve-reject
// 使用 useReactFlow().setNodes 更新节点数据
```

```
┌──────────────────────────┐
│  ○ (target handle)       │
│                          │
│  👤 Human Review Step     │
│                          │
│  Please review the code  │  ← 双击编辑
│  output and provide      │
│  feedback...        ✏️   │
│                          │
│  [Text input]            │  ← 点击切换
│                          │
│  ○ (source handle)       │
└──────────────────────────┘
```

### 8.2 RunConsole 输入表单

```
human_input_required 事件触发:

  Text input:
  ┌──────────────────────────────┐
  │ 👤 Human Input Required      │
  │ Please review this output... │
  │ ┌──────────────────────────┐ │
  │ │ Your response...         │ │
  │ └──────────────────────────┘ │
  │ [Submit]                     │
  └──────────────────────────────┘

  Approve/Reject:
  ┌──────────────────────────────┐
  │ 👤 Human Input Required      │
  │ Is this output acceptable?   │
  │ [Approve]  [Reject]          │
  └──────────────────────────────┘
```

```typescript
// frontend/src/hooks/use-workflow-run.ts
const submitHumanInput = useCallback(async (response: string) => {
  const { runId, humanInput } = state;
  if (!runId || !humanInput) return;

  setState((s) => ({ ...s, running: true, done: false, humanInput: null }));

  const res = await fetch(
    `${API_URL}/api/workflows/runs/${runId}/human-input`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: humanInput.nodeId, response }),
    }
  );

  // 重新建立 SSE 连接，继续接收事件
  await processStream(res.body!.getReader());
}, [state.runId, state.humanInput]);
```

### 8.3 完整交互时序

```
用户点击 Run
  │
  ├─→ POST /api/workflows/:id/run
  │     → SSE stream 开始
  │
  ├─→ parallel_start (如有并行)
  ├─→ agent_start → thinking → tool_call → tool_result → agent_output
  │
  ├─→ human_input_required { prompt, inputType, runId }
  │     │
  │     ├─ 前端: 显示输入表单
  │     └─ RunConsole: 暂停输入区
  │
  ├─→ SSE done (run 暂停)
  │
用户填写响应 → Submit
  │
  ├─→ POST /api/workflows/runs/:runId/human-input { response }
  │     → resumeRun() → Command({ resume }) → invoke()
  │     → 新 SSE stream 开始
  │
  ├─→ node_output { content: "用户响应" }
  ├─→ (后续节点继续执行)
  └─→ SSE done (run 完成)
```

---

## 9. 多 Human Input 节点支持

```
Start → Agent A → Human Input 1 → Agent B → Human Input 2 → End

流程:
  1. runWorkflow → Agent A 执行 → Human Input 1 暂停 → done(awaiting_input)
  2. resume → Human Input 1 恢复 → Agent B 执行 → Human Input 2 暂停 → done(awaiting_input)
  3. resume → Human Input 2 恢复 → End → done(completed)
```

每次 resume 都可能再次触发 `GraphInterrupt`，`resumeRun` 的 catch 块正确处理了这种情况。

---

## 10. 设计取舍

```
选择:
  ✅ LangGraph interrupt + Command 机制（框架原生支持）
  ✅ MemorySaver 模块级实例（开发环境够用）
  ✅ buildGraph 独立函数重复用
  ✅ runId 通过 human_input_required 事件传递
  ✅ 前端表单在 RunConsole 中内联（非弹窗）

不选择:
  ❌ 自建暂停/恢复机制（轮询 DB 状态）
     理由: LangGraph 已提供完整方案，自建需处理状态序列化、
           resume 位置恢复、并发安全等复杂问题。

  ❌ 弹窗/Modal 输入
     理由: RunConsole 内联表单保持上下文可见，用户可看到
           之前的执行历史和当前暂停位置的上下文。

  ❌ WebSocket 替代 SSE
     理由: SSE 单向够用（前端只需接收），实现更简单。
           resume 是新的 HTTP 请求，不是同一个 SSE 连接。
```

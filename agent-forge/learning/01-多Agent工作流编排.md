# 多 Agent 工作流编排 — 深度解析

> 基于 LangGraph StateGraph 实现可视化多 Agent 编排。从节点定义、状态传递、条件路由到代码节点执行，完整拆解实现细节。

---

## 1. 为什么需要工作流编排？

单个 Agent 能处理问答、代码生成等任务，但复杂场景需要多个 Agent 协作：

```
用户: "分析这个需求，设计方案，然后生成代码"
  
单一 Agent 方式:              多 Agent 工作流方式:
  ┌──────────┐                  ┌─────────┐     ┌─────────┐     ┌─────────┐
  │ 一个 Agent│                  │ 分析Agent│ ──▶│ 设计Agent│ ──▶│ 代码Agent│
  │ 做所有事  │                  │ 需求分析  │     │ 架构设计  │     │ 代码生成  │
  └──────────┘                  └─────────┘     └─────────┘     └─────────┘
  上下文过长                       每个 Agent 专注单一任务
  提示词冲突                       独立 system prompt
  难以调试                         每个节点可独立测试
```

### Agent Forge 中的编排模式

```
┌────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────┐
│ Start  │ ──▶│ 分析 Agent    │ ──▶│ 方案 Agent    │ ──▶│ End  │
│ (输入) │     │ system: "你是 │     │ system: "你是 │     │(输出)│
│        │     │  需求分析专家" │     │  架构设计师"   │     │      │
└────────┘     └──────────────┘     └──────────────┘     └──────┘
```

---

## 2. LangGraph StateGraph 核心机制

### 2.1 为什么选择 LangGraph？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **自建 for 循环** | 简单直接 | 无状态管理、无可视化边、无条件路由 |
| **LangChain Chain** | 链式调用方便 | 仅支持线性流程，不支持分支/并行 |
| **LangGraph StateGraph** | 图编排、状态共享、条件路由、START/END 抽象 | 额外依赖 |
| **Temporal / Camunda** | 企业级工作流 | 过重，不适合 Agent 场景 |

LangGraph 的 `StateGraph` 提供了最合适的抽象层：节点 = 执行单元，边 = 数据流向，状态 = 共享上下文。

### 2.2 状态定义

```typescript
// backend/src/services/workflow/runner.ts

const WorkflowState = Annotation.Root({
  input: Annotation<string>,           // 用户原始输入

  agentOutputs: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  executionLog: Annotation<Array<{
    nodeId: string;
    agentName: string;
    output: string;
  }>>({
    reducer: (current, update) => [...current, ...update],
    default: () => ([]),
  }),
});
```

**关键设计：reducer 函数**

```
初始状态: { agentOutputs: {}, executionLog: [] }

Agent A 执行:
  return { agentOutputs: { "node_a": "分析结果..." }, executionLog: [...] }
  → reducer 合并 → agentOutputs: { "node_a": "分析结果..." }

Agent B 执行:
  return { agentOutputs: { "node_b": "设计方案..." }, executionLog: [...] }
  → reducer 合并 → agentOutputs: { "node_a": "分析结果...", "node_b": "设计方案..." }
```

`agentOutputs` 的 spread reducer 确保每个新节点的输出追加到共享字典，下游节点可读取上游任意输出。

### 2.3 节点类型与执行函数

```
┌──────────────────────────────────────────────────────────────┐
│                      Node Type Dispatch                       │
├──────────┬──────────────┬──────────────┬─────────────────────┤
│  start   │     end      │    agent     │        code         │
├──────────┼──────────────┼──────────────┼─────────────────────┤
│ 透传输入  │ 收集所有输出   │ LLM 推理+工具 │ new Function 执行   │
│ 1 个handle│ 1 个handle   │ 2 个handle   │ 2 个handle         │
│ (source) │ (target)     │ (target+src) │ (target+src)       │
└──────────┴──────────────┴──────────────┴─────────────────────┘
```

**Start 节点实现：**

```typescript
if (node.type === "start") {
  graph.addNode(node.id, (state: typeof WorkflowState.State) => {
    const output = state.input;        // 直接将用户输入作为输出
    emitSSE(controller, { type: "node_start", step, agentId: node.id, ... });
    return {
      agentOutputs: { [node.id]: output },
      executionLog: [{ nodeId: node.id, agentName: node.label, output }],
    };
  });
}
```

**End 节点实现：**

```typescript
if (node.type === "end") {
  graph.addNode(node.id, (state: typeof WorkflowState.State) => {
    // 将所有上游输出拼接为最终结果
    const output = Object.values(state.agentOutputs).join("\n\n") || state.input;
    return {
      agentOutputs: { [node.id]: output },
      executionLog: [{ nodeId: node.id, agentName: node.label, output }],
    };
  });
}
```

**Agent 节点实现（核心）：**

```typescript
// 闭包工厂模式——每个节点预先加载 Agent 配置和工具
async function createAgentNodeFn(nodeId: string, agentId: string, agentName: string) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));

  // 解析该 Agent 启用的工具
  const toolIds = agent.toolIds as string[];
  const allTools = await db.select().from(tools);
  const agentTools = allTools.filter((t) => toolIds.includes(t.id) && t.enabled);
  const toolDefs: ToolDefinition[] = agentTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));

  return async (state: typeof WorkflowState.State) => {
    // 构建上下文：拼接上游所有 Agent 的输出
    const prevOutputs = state.agentOutputs;
    const contextParts: string[] = [];

    if (Object.keys(prevOutputs).length > 0) {
      contextParts.push("Previous agent outputs:");
      for (const [nid, output] of Object.entries(prevOutputs)) {
        contextParts.push(`[${nid}]: ${output}`);
      }
    }

    const userMessage = contextParts.length > 0
      ? `${contextParts.join("\n")}\n\nUser task: ${state.input}`
      : state.input;

    const messages: ChatMessage[] = [
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: userMessage },
    ];

    // 标准 LLM + Tool 循环 (最多 10 轮)
    let finalOutput = "";
    for (let iter = 0; iter < 10; iter++) {
      const response = await chatCompletion(messages, toolDefs.length > 0 ? toolDefs : undefined, {
        temperature: agent.temperature ?? undefined,
        maxTokens: agent.maxTokens ?? undefined,
      });

      if (response.tool_calls?.length) {
        // 工具调用循环
        messages.push({ role: "assistant", content: response.content || "", tool_calls: response.tool_calls });
        for (const tc of response.tool_calls) {
          const result = await executeTool(tc.function.name, tc.function.arguments);
          messages.push({ role: "tool", content: result, tool_call_id: tc.id });
        }
      } else {
        finalOutput = response.content || "";
        break;
      }
    }

    return {
      agentOutputs: { [nodeId]: finalOutput },
      executionLog: [{ nodeId, agentName, output: finalOutput }],
    };
  };
}
```

**Code 节点实现：**

```typescript
if (node.type === "code") {
  graph.addNode(node.id, async (state: typeof WorkflowState.State) => {
    let output = "";
    try {
      const fn = new Function("state", node.content || "return state.input");
      const raw = fn({ ...state });  // state 包含 agentOutputs + input + executionLog
      output = typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch (err) {
      output = `Code error: ${err instanceof Error ? err.message : String(err)}`;
    }
    return {
      agentOutputs: { [node.id]: output },
      executionLog: [{ nodeId: node.id, agentName: node.label, output }],
    };
  });
}
```

---

## 3. 边的处理：数据流向控制

### 3.1 三种边类型

```
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│   常规边          │  │   条件边           │  │   隐式边              │
│   source → target│  │ source → target if│  │ START → entry nodes │
│   无条件传递       │  │   keyword 匹配     │  │ exit nodes → END    │
└─────────────────┘  └──────────────────┘  └──────────────────────┘
```

### 3.2 入口/出口节点识别

```typescript
// 统计每个节点的入度
const incomingCount = new Map<string, number>();
for (const edge of edges) {
  incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
}

// 入度为 0 = 入口节点，从 START 连接
const entryNodes = nodes.filter((n) => !incomingCount.has(n.id));
if (entryNodes.length === 1) {
  graph.addEdge(START, entryNodes[0].id);
} else if (entryNodes.length > 1) {
  for (const n of entryNodes) {
    graph.addEdge(START, n.id);   // 多个入口 → 并行执行
  }
}

// 出度为 0 = 出口节点，连接到 END
const hasOutgoing = new Set<string>();
for (const edge of edges) {
  hasOutgoing.add(edge.source);
}
for (const node of nodes) {
  if (!hasOutgoing.has(node.id) && !nodeHasConditional.has(node.id)) {
    graph.addEdge(node.id, END);
  }
}
```

### 3.3 条件路由

```typescript
// 条件边定义 (frontend 在边上设置 keyword)
{
  id: "edge_1",
  source: "agent_A",
  target: "agent_B",
  condition: { keyword: "需要优化" }
}

// 条件求值
function evaluateCondition(output: string, condition: Record<string, unknown>): boolean {
  const keyword = condition.keyword as string;
  if (!keyword) return true;           // 无 keyword → 默认通过
  return output.toLowerCase().includes(keyword.toLowerCase());
}

// LangGraph 条件边注册
graph.addConditionalEdges(node.id, (state) => {
  const nodeOutput = state.agentOutputs[node.id] || "";
  for (const edge of conditionalEdges) {
    if (evaluateCondition(nodeOutput, edge.condition)) {
      return edge.target;              // 命中第一个匹配的边
    }
  }
  return END;                          // 都不匹配 → 结束
}, [...destinations, END]);
```

**条件路由使用场景：**

```
┌──────────┐                         ┌─────────────────┐
│ 翻译Agent│── 输出含"技术文档"关键字 ──▶│ 技术校对 Agent   │
│          │                         └─────────────────┘
│          │── 输出含"营销文案"关键字 ──▶┌─────────────────┐
│          │                         │ 文案审核 Agent   │
└──────────┘                         └─────────────────┘
```

---

## 4. 编译与执行

```typescript
// 编译 StateGraph 为可执行图
const compiled = graph.compile();

// 执行 (单次 invoke，LangGraph 自动按拓扑序执行)
const result = await compiled.invoke({
  input: userInput,
  agentOutputs: {},
  executionLog: [],
});

// 收集最终输出
const finalOutput = result.agentOutputs
  ? Object.values(result.agentOutputs as Record<string, string>).join("\n\n")
  : "";
```

**LangGraph 的执行保证：**
1. 从 START 连接的节点开始
2. 按拓扑顺序依次执行每个节点
3. 每个节点的返回值经 reducer 合并到共享状态
4. 条件边运行时根据前节点输出动态选择路径
5. 所有路径到达 END 后返回最终状态

---

## 5. 上下文传递策略

### 5.1 下游如何获取上游输出？

```
Node A 输出: "用户需求分析：需要一个电商系统..."
Node B 输入: 
  Previous agent outputs:
  [node_a]: 用户需求分析：需要一个电商系统...

  User task: 帮我设计方案
```

每个 Agent 节点的 system prompt 是独立的，但 user message 拼接了所有上游输出：

```typescript
if (Object.keys(prevOutputs).length > 0) {
  contextParts.push("Previous agent outputs:");
  for (const [nid, output] of Object.entries(prevOutputs)) {
    contextParts.push(`[${nid}]: ${output}`);
  }
}
const userMessage = contextParts.length > 0
  ? `${contextParts.join("\n")}\n\nUser task: ${state.input}`
  : state.input;
```

### 5.2 上下文大小控制

当上游 Agent 输出很长时，全部拼入下一个 Agent 的 user message 会超出 token 限制。当前实现不做截断（信任模型上下文窗口足够），未来优化方向：

- 在 Agent 之间插入 Code 节点做摘要
- 限制每个上游输出截取前 N 字符
- 使用 LangGraph 的 `checkpointer` 做持久化增量

---

## 6. 运行时 SSE 事件流

工作流执行过程中，每个节点通过 SSE 实时报告状态：

```
SSE event stream for workflow run:

event: node_start       →  "Start" started
event: node_output      →  "Start" output: "帮我设计方案..."
event: agent_start      →  Agent "需求分析" started
event: agent_output     →  Agent "需求分析" output: "..."
event: agent_start      →  Agent "架构设计" started
event: agent_output     →  Agent "架构设计" output: "..."
event: node_output      →  "End" collected output
event: done             →  workflow complete
```

前端根据 `currentNodeId` 实时高亮正在执行的节点：

```typescript
const activeNodes = nodes.map((n) => {
  const isRunning = running && (
    n.data.agentId === currentNodeId || n.id === currentNodeId
  );
  const isCompleted = done || events.some(
    (e) => (e.type === "agent_output" || e.type === "node_output") &&
      (e.agentId === n.data.agentId || e.agentId === n.id)
  );
  return { ...n, data: { ...n.data, isRunning, isCompleted } };
});
```

---

## 7. 关键问题与解决

### 7.1 闭包中的 agent 变量引用

**问题：** 在 for 循环中创建闭包时，如果直接引用循环变量，所有闭包会共享最后一个值。

**解决：** 在循环体内创建工厂函数 `createAgentNodeFn()`，将 `nodeId`、`agentId`、`agent` 对象作为参数传入，确保每个闭包捕获独立的值。

### 7.2 条件边 + 常规边冲突

**问题：** 一个节点可能同时有常规边和条件边。

**解决：** 分离处理——条件边使用 `addConditionalEdges`，常规边使用 `addEdge`。运行时条件边优先匹配，未命中则走 END。

### 7.3 后端 TypeScript 类型收窄

**问题：** 动态图构建中 `graph.addNode()` 和 `graph.addEdge()` 的参数名是动态的（node.id），TypeScript 无法静态校验。

**解决：** `const graph = new StateGraph(WorkflowState) as any` —— 在类型安全和灵活性之间选择灵活性。图结构在运行时通过 nodes/edges JSONB 定义，静态类型无法覆盖所有可能。

---

## 8. 总结

```
Agent Forge 工作流 = LangGraph StateGraph + 自定义节点工厂 + SSE 事件流

核心设计:
  1. Annotation.Root 定义共享状态 + reducer 合并输出
  2. 工厂函数 createAgentNodeFn 为每个节点创建隔离的执行环境
  3. 条件路由通过 keyword 匹配实现动态路径选择
  4. SSE 实时推送节点执行状态到前端画布
  5. 入口/出口节点自动识别，连接 START/END

适用场景:
  - 多步骤 Agent 流水线 (分析 → 设计 → 实现)
  - 条件分支工作流 (根据输出内容选择下一步)
  - 人工审核节点 (Agent 输出 → Code 节点过滤 → 下一 Agent)
```

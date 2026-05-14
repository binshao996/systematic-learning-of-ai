# LangGraph 状态图实战

> 基于 `@langchain/langgraph` v1.3，从 LangChain 生态定位、StateGraph API 设计、状态管理机制、条件路由、编译执行到 Agent Forge 中的真实集成，完整拆解状态图编排模式。

---

## 1. LangChain 生态定位

### 1.1 生态全景

```
LangChain 生态系统:

  ┌─────────────────────────────────────────────────────────┐
  │ LangChain                                                │
  │ 高层抽象：Chain, Agent, Tool, Memory, Retrieval          │
  │ 适合：快速原型、标准 RAG、简单 Agent                      │
  └─────────────────────────────────────────────────────────┘
        │
        ├── LangChain Community (社区集成：300+ 第三方)
        │
  ┌─────┴───────────────────────────────────────────────────┐
  │ LangGraph                                                │
  │ 中层编排：StateGraph, MessageGraph, Checkpointer          │
  │ 适合：多步骤 Agent、条件分支、人机协同、并行执行          │
  └─────────────────────────────────────────────────────────┘
        │
        ├── LangSmith (可观测性：调试、追踪、评估)
        ├── LangServe (部署：FastAPI 包装)
        └── LangChain Core (底层抽象：lc_runnable, BaseMessage)

Agent Forge 的选择:
  用 LangGraph（状态图编排）
  不用 LangChain 高层抽象（自写 Agent 循环）
```

### 1.2 什么时候用 LangChain？什么时候用 LangGraph？

| 场景 | 推荐 | 理由 |
|------|------|------|
| 简单问答 RAG | LangChain | Chain + Prompt + Retriever 足够 |
| 单 Agent + 工具 | LangChain 或自写 | 循环就 20 行，不一定要框架 |
| 多 Agent 串联 | **LangGraph** | 状态传递、条件路由、并行 |
| 条件分支工作流 | **LangGraph** | `addConditionalEdges` 原生支持 |
| Human-in-the-loop | **LangGraph** | `interrupt()` + `Command.resume()` |
| 流式输出 | 两者都支持 | LangGraph 有 `stream()` / `astream_events()` |
| 持久化/重放 | **LangGraph** | Checkpointer 内置支持 |

### 1.3 Agent Forge 的取舍

```
用 LangGraph 的:
  - StateGraph (状态定义 + 图编译)
  - START / END (内建起点终点)
  - addConditionalEdges (条件路由)
  - Annotation.Root (声明式状态)

不用 LangChain 的:
  - createReactAgent() 等高层 Agent 封装
  - AgentExecutor (自动工具循环)
  - PromptTemplate (自写 system prompt 拼接)
  - Memory / ChatMessageHistory (自管理 messages 数组)
```

取舍逻辑：**编排层用框架，执行层自写**。图的结构管理（节点、边、拓扑排序、状态合并）是复杂且有标准解的问题，值得用框架。Agent 循环（调 LLM → 解析 tool_calls → 执行工具 → 回传结果）只有 ~20 行，自写更灵活且可调试。

---

## 2. StateGraph 核心概念

### 2.1 什么是状态图？

```
传统 DAG（有向无环图）:          StateGraph（状态图）:
  节点 = 函数                      节点 = 函数(输入状态) → 输出状态片段
  边 = 执行顺序                    边 = 数据流 + 条件路由
  无状态                           有状态（统一 Schema）
```

StateGraph 的三个核心元素：

```
┌────────────────────────────────────────────────────────┐
│ 1. State Schema (状态 Schema)                           │
│    定义整张图的共享状态结构 + 每个字段的合并策略           │
│                                                        │
│ 2. Nodes (节点)                                         │
│    执行单元，接收当前 State，返回部分 State 更新          │
│                                                        │
│ 3. Edges (边)                                           │
│    普通边: source → target，无条件流转                   │
│    条件边: source → 动态选 target，运行时决定             │
└────────────────────────────────────────────────────────┘
```

### 2.2 执行模型

```
graph.compile() → compiled.invoke(initialState)

执行过程:
  1. 从 START 连接的节点开始
  2. 按拓扑序依次执行每个节点
  3. 节点返回值经 reducer 合并到共享状态
  4. 条件边根据当前状态动态选路径
  5. 所有路径到达 END 后返回最终状态
```

**LangGraph 保证：**
- 拓扑顺序执行（前置节点完成才执行后继）
- 并行节点可以同时执行（多个入度为 0 的节点连到 START）
- 条件边运行时求值（路径非预先确定）
- 每个节点的 state 输入是当前最新合并结果

---

## 3. 状态定义 (Annotation.Root)

### 3.1 三种 Annotation 模式

```typescript
import { Annotation } from "@langchain/langgraph";

const WorkflowState = Annotation.Root({

  // 模式 1：简单值（覆盖语义）
  // 每次更新直接替换，无 reducer
  input: Annotation<string>,

  // 模式 2：带 reducer（合并语义）
  // 每次更新通过 reducer 与当前值合并
  agentOutputs: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  // 模式 3：带 reducer（追加语义）
  // 每次更新追加到累积列表
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

### 3.2 Reducer 设计原则

```
reducer 签名: (current: T, update: T) => T

current — 当前累积的状态
update  — 本次节点返回的新增量
return  — 合并后的新状态

设计原则:
  1. 幂等 — 同一个 update 应用两次结果相同
  2. 顺序无关 — 并行节点返回时 reducer 执行顺序不影响最终结果
  3. 纯函数 — 不修改 current 或 update，返回新对象
```

### 3.3 agentOutputs 的 spread reducer

```typescript
agentOutputs: Annotation<Record<string, string>>({
  reducer: (current, update) => ({ ...current, ...update }),
  default: () => ({}),
})
```

执行示例：

```
初始状态: agentOutputs = {}

Node A 返回: { agentOutputs: { "node_a": "分析结果..." } }
  → reducer({}, {"node_a": "分析结果..."}) = { "node_a": "分析结果..." }

Node B 返回: { agentOutputs: { "node_b": "设计方案..." } }
  → reducer({"node_a": "..."}, {"node_b": "..."}) = { "node_a": "...", "node_b": "..." }
```

下游节点可以读取任意上游输出：

```typescript
// Node C 读取 Node A 和 Node B 的输出
const analysisResult = state.agentOutputs["node_a"];
const designResult = state.agentOutputs["node_b"];
```

### 3.4 executionLog 的 concat reducer

```typescript
executionLog: Annotation<Array<{...}>>({
  reducer: (current, update) => [...current, ...update],
  default: () => ([]),
})
```

每个节点追加一条记录，最终得到完整的执行时间线：

```
executionLog = [
  { nodeId: "n1", agentName: "Start", output: "..." },
  { nodeId: "n2", agentName: "需求分析", output: "..." },
  { nodeId: "n3", agentName: "架构设计", output: "..." },
  { nodeId: "n4", agentName: "End", output: "最终结果" },
]
```

### 3.5 常见 Reducer 模式

| 场景 | Reducer | 语义 |
|------|---------|------|
| 覆盖 | 无（不传 reducer） | 最新值覆盖旧值 |
| 合并 | `(c, u) => ({...c, ...u})` | 键值对累积，同键覆盖 |
| 追加 | `(c, u) => [...c, ...u]` | 数组累积，时间线/日志 |
| 求和 | `(c, u) => c + u` | 计数器 |
| 去重 | `(c, u) => [...new Set([...c, ...u])]` | 集合累积 |
| 取最新 | `(c, u) => u` | 只保留最后一次值 |

---

## 4. 节点实现模式

### 4.1 节点函数签名

```typescript
type NodeFunc = (state: typeof WorkflowState.State) =>
  | Partial<typeof WorkflowState.State>    // 同步
  | Promise<Partial<typeof WorkflowState.State>>;  // 异步

// 添加到图
graph.addNode(nodeId, nodeFunc);
```

节点函数：
- 接收完整的当前 State
- 返回**部分 State**（只包含要更新的字段）
- LangGraph 会根据 Reducer 自动合并返回值
- 同步和异步函数都支持

### 4.2 透传节点（Start）

```typescript
graph.addNode(node.id, (state) => {
  const output = state.input;
  emitSSE(controller, { type: "node_start", agentId: node.id });

  return {
    agentOutputs: { [node.id]: output },
    executionLog: [{ nodeId: node.id, agentName: node.label, output }],
  };
});
```

**职责：** 将用户输入作为第一个节点的输出，确保下游节点能从 `agentOutputs` 读到数据。

### 4.3 收集节点（End）

```typescript
graph.addNode(node.id, (state) => {
  const output = Object.values(state.agentOutputs).join("\n\n") || state.input;
  emitSSE(controller, { type: "node_output", agentId: node.id, content: output });

  return {
    agentOutputs: { [node.id]: output },
    executionLog: [{ nodeId: node.id, agentName: node.label, output }],
  };
});
```

**职责：** 收集所有上游输出，拼接成最终结果。

### 4.4 代码节点（Code）

```typescript
graph.addNode(node.id, async (state) => {
  let output = "";
  try {
    const fn = new Function("state", node.content || "return state.input");
    const raw = fn({ ...state });
    output = typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch (err) {
    output = `Code error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    agentOutputs: { [node.id]: output },
    executionLog: [{ nodeId: node.id, agentName: node.label, output }],
  };
});
```

**设计要点：**
- `new Function("state", code)` 接收执行上下文
- `{ ...state }` 将 State 展开为普通对象传入（避免只读限制）
- 自动处理非字符串返回值（JSON.stringify）
- try/catch 保证不因代码错误中断整个工作流

### 4.5 Agent 节点（LLM 调用）— 闭包工厂模式

```typescript
async function createAgentNodeFn(nodeId: string, agentId: string, agentName: string) {
  // 预加载 Agent 配置 + 工具（在编译时，非运行时）
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  const toolIds = agent.toolIds as string[];
  const allTools = await db.select().from(tools);
  const agentTools = allTools.filter((t) => toolIds.includes(t.id) && t.enabled);
  const toolDefs = agentTools.map((t) => ({ type: "function", function: { ... } }));

  // 返回闭包 — 每个节点独占自己的 agent/tools
  return async (state: typeof WorkflowState.State) => {
    // 构建上下文消息
    const prevOutputs = state.agentOutputs;
    const contextParts = Object.entries(prevOutputs).map(
      ([nid, output]) => `[${nid}]: ${output}`
    );
    const userMessage = contextParts.length > 0
      ? `${contextParts.join("\n")}\n\nUser task: ${state.input}`
      : state.input;

    const messages = [
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: userMessage },
    ];

    // LLM + Tool 循环
    for (let iter = 0; iter < 10; iter++) {
      const response = await chatCompletion(messages, toolDefs);
      if (response.tool_calls?.length) {
        // 执行工具 → 结果回传
        messages.push({ role: "assistant", content: response.content || "", tool_calls: response.tool_calls });
        for (const tc of response.tool_calls) {
          const result = await executeTool(tc.function.name, tc.function.arguments);
          messages.push({ role: "tool", content: result, tool_call_id: tc.id });
        }
      } else {
        // 最终回复
        return {
          agentOutputs: { [nodeId]: response.content || "" },
          executionLog: [{ nodeId, agentName, output: response.content || "" }],
        };
      }
    }
  };
}
```

**为什么用闭包工厂模式？**

```
问题: for 循环中创建闭包
for (const node of nodes) {
  graph.addNode(node.id, async (state) => {
    // node 是循环变量，所有闭包共享最后一个值
  });
}

解决: 工厂函数
async function createAgentNodeFn(nodeId, agentId, agentName) {
  return async (state) => {
    // nodeId, agentId, agentName 是函数参数，每次调用独立
  };
}

for (const node of nodes) {
  const nodeFn = await createAgentNodeFn(node.id, node.agentId, node.label);
  graph.addNode(node.id, nodeFn);
}
```

这是 JavaScript 闭包的经典坑。工厂函数将循环变量转为函数参数，确保每个闭包捕获独立的值。

---

## 5. 边与路由

### 5.1 入口节点自动识别

```typescript
// 统计入度
const incomingCount = new Map<string, number>();
for (const edge of edges) {
  incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
}

// 入度为 0 的节点从 START 连接
const entryNodes = nodes.filter((n) => !incomingCount.has(n.id));

if (entryNodes.length === 1) {
  graph.addEdge(START, entryNodes[0].id);
} else if (entryNodes.length > 1) {
  // 多个入口 → 并行执行
  for (const n of entryNodes) {
    graph.addEdge(START, n.id);
  }
}
```

**设计要点：**
- 不需要用户手动指定入口节点
- 多个入口节点时 LangGraph 并行执行
- `START` 是 LangGraph 内建常量

### 5.2 常规边

```typescript
// 节点间连线
graph.addEdge(source, target);

// 出口 → END
graph.addEdge(node.id, END);
```

出口节点识别：出度为 0 且有条件边的节点不连 END（条件边有自己的 fallback）。

### 5.3 条件边

```typescript
graph.addConditionalEdges(
  nodeId,                           // 源节点
  (state) => {                      // 路由函数
    const output = state.agentOutputs[nodeId] || "";
    for (const edge of conditionalEdges) {
      if (evaluateCondition(output, edge.condition)) {
        return edge.target;          // 返回目标节点 ID
      }
    }
    return END as unknown as string; // fallback
  },
  [...destinations, END as unknown as string]  // 所有可能的目标（校验用）
);
```

**条件求值函数：**

```typescript
function evaluateCondition(output: string, condition: Record<string, unknown>): boolean {
  const keyword = condition.keyword as string;
  if (!keyword) return true;
  return output.toLowerCase().includes(keyword.toLowerCase());
}
```

**使用场景：**

```
┌──────────────┐    输出含"报错"    ┌──────────────┐
│ 分析 Agent    │ ────────────────▶│ 排错 Agent    │
└──────────────┘                   └──────────────┘
       │
       │ 输出含"正常"    ┌──────────────┐
       └──────────────▶│ 总结 Agent    │
                       └──────────────┘
```

### 5.4 条件边 vs 常规边优先级

一个节点可以同时有常规边和条件边：

```typescript
// 优先处理条件边
const conditionalEdges = sourceEdges.filter((e) => e.condition);
const regularEdges = sourceEdges.filter((e) => !e.condition);

if (conditionalEdges.length > 0) {
  graph.addConditionalEdges(node.id, routingFn, [...dest, END]);
}
for (const edge of regularEdges) {
  graph.addEdge(edge.source, edge.target);
}
```

条件边的路由函数如果不匹配任何条件，fallback 到 `END`（不是常规边），避免了同时走两条路径的歧义。

---

## 6. 编译与执行

### 6.1 编译

```typescript
const compiled = graph.compile();
```

`.compile()` 做三件事：
1. 验证图结构完整性（无孤立节点、无循环引用）
2. 确定拓扑执行顺序
3. 返回 `CompiledGraph` 实例

### 6.2 执行

```typescript
const result = await compiled.invoke({
  input: userInput,
  agentOutputs: {},
  executionLog: [],
});

// 提取最终输出
const finalOutput = result.agentOutputs
  ? Object.values(result.agentOutputs as Record<string, string>).join("\n\n")
  : "";
```

`invoke()` 返回最终的完整 State（所有节点执行完毕后的累积状态）。

### 6.3 流式执行（未使用但有价值的 API）

```typescript
// 逐节点流式
for await (const chunk of await compiled.stream(initialState)) {
  // chunk = 每个节点完成后的状态更新
}

// 逐事件流式
for await (const event of await compiled.astream_events(initialState, { version: "v2" })) {
  // event = 每个状态变化事件（节点开始、结束、tool 调用等）
}
```

Agent Forge 没有用 LangGraph 的流式 API——因为 SSE 事件在节点内部手动发射，比 LangGraph 的事件流更细粒度（可以发 thinking、tool_call 等中间事件）。

### 6.4 结果持久化

```typescript
await db.update(runs).set({
  status: "completed",
  output: finalOutput,
  traceEvents: allEvents,     // SSE 事件全量存 JSONB
  completedAt: new Date(),
}).where(eq(runs.id, runId));
```

---

## 7. TypeScript 类型处理

### 7.1 `as any` 取舍

```typescript
const graph = new StateGraph(WorkflowState) as any;
```

StateGraph 的泛型参数期望节点名是字符串字面量联合类型（`"node_a" | "node_b"`），但项目中节点名是运行时从数据库读的动态字符串。`as any` 绕过了这个限制。

```
取舍:
  静态安全: 编译时检查节点名和边是否匹配
  动态灵活: 支持用户自由创建工作流

选择灵活性的理由:
  - 工作流定义存在数据库 JSONB 中，编译时不可知
  - 图结构在运行时通过遍历 nodes/edges 动态构建
  - 节点名是 UUID（node.id），不是可枚举的静态值
```

### 7.2 State 类型引用

```typescript
// 在闭包中使用 typeof 引用 State 类型
graph.addNode(node.id, (state: typeof WorkflowState.State) => {
  // state 的类型是完整的 AgentRunState
  const prevOutputs = state.agentOutputs;  // Record<string, string>
  const logs = state.executionLog;          // Array<{...}>
});
```

`typeof WorkflowState.State` 是 LangGraph 推断出的 State 类型，包含所有 Annotation 的类型信息。

---

## 8. 与 LangChain Agent 的对比

### 8.1 LangChain createReactAgent 模式（本项目没用）

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// 声明式：定义工具 + prompt → 自动管理循环
const agent = createReactAgent({
  llm: model,
  tools: [calculatorTool, webSearchTool],
  prompt: "你是一个数学助手",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "1+1=?" }],
});
```

### 8.2 Agent Forge 自写循环模式

```typescript
// 命令式：手动管理 messages + tool_calls 循环
const messages = [
  { role: "system", content: systemPrompt },
  { role: "user", content: userInput },
];

for (let i = 0; i < 10; i++) {
  const response = await chatCompletion(messages, toolDefs);

  if (response.tool_calls?.length) {
    messages.push(assistantMsg);
    for (const tc of response.tool_calls) {
      const result = await executeTool(tc.function.name, tc.function.arguments);
      messages.push(toolMsg);
      emitSSE(controller, { type: "tool_call", ... });
      emitSSE(controller, { type: "tool_result", ... });
    }
  } else {
    emitSSE(controller, { type: "agent_output", ... });
    break;
  }
}
```

### 8.3 两种模式的对比

| 维度 | createReactAgent | 自写循环 |
|------|-----------------|---------|
| 代码量 | ~5 行 | ~20 行 |
| 工具循环 | 自动 | 手动 for 循环 |
| SSE 控制 | 需适配 astream_events | 完全控制推送时机 |
| 调试 | 框架内部状态难观测 | messages 数组直接可看 |
| 最大轮数 | 框架控制 | 手动限制 |
| 错误处理 | 框架统一处理 | 按需定制 |
| 依赖 | langchain + langgraph | 只依赖 chatCompletion |

**选择自写的理由：**
- 循环逻辑极其简单（LLM 调用 → tool 执行 → 回传 → 继续）
- 完全控制 SSE 推送时机（每个 tool_call / tool_result 都推事件）
- 不引入 `@langchain/core` 的 Message 抽象层（减少依赖和心智负担）
- 调试可以直接 `console.log(messages)` 看完整对话历史

---

## 9. 常见问题

### 9.1 闭包变量引用错误

```
问题:
for (const node of nodes) {
  graph.addNode(node.id, async (state) => {
    console.log(node.label);  // 所有闭包打印同一个 label（最后一个）
  });
}

解决:
for (const node of nodes) {
  const fn = await createAgentNodeFn(node.id, node.agentId, node.label);
  graph.addNode(node.id, fn);
}
// createAgentNodeFn 的参数在每次调用时独立绑定
```

### 9.2 条件边 fallback 未覆盖

没有匹配条件时，必须返回一个目标（通常是 `END`），否则 LangGraph 运行时报错。

```typescript
// 始终提供 fallback
for (const edge of conditionalEdges) {
  if (evaluateCondition(output, edge.condition)) return edge.target;
}
return END as unknown as string;  // 确保有兜底
```

### 9.3 State 对象不可变

LangGraph 的 State 对象设计为不可变。在节点中不应该修改 state，而是返回要更新的字段：

```typescript
// 错误
state.agentOutputs[nodeId] = output;  // 直接修改（可能不生效）
return {};

// 正确
return { agentOutputs: { [nodeId]: output } };  // 返回更新
```

需要在节点中展开 state 时（如 Code 节点的 `new Function`），先 `{ ...state }` 复制：

```typescript
const fn = new Function("state", code);
const raw = fn({ ...state });  // 展开为普通可变对象
```

---

## 10. 总结

```
LangGraph StateGraph = 声明式状态 Schema + 动态节点注册 + Reducer 状态合并 + 条件路由

Agent Forge 中的使用模式:
  1. Annotation.Root 定义三种 Annotation（覆盖/合并/追加）
  2. 工厂函数 createAgentNodeFn 为每个 Agent 节点创建隔离闭包
  3. 自动识别入口/出口节点，连接 START/END
  4. 条件边通过 keyword 匹配实现动态路径
  5. SSE 事件在节点内部手动发射（非 LangGraph astream_events）

为什么 LangGraph + 自写循环，而非全用 LangChain？
  - 编排层（图结构、状态传递、条件路由）→ 用框架（LangGraph）
  - 执行层（LLM 循环、工具调用、SSE 推送）→ 自写（完全控制）
  - 20 行循环代码不值得引入 AgentExecutor 等重依赖

适用场景：
  ✓ 多 Agent 流水线（分析 → 设计 → 实现）
  ✓ 条件分支工作流（根据输出内容选择下一步）
  ✓ 并行执行（多个独立任务同时跑）
  ✓ Human-in-the-loop（暂停等待人工审批）
  ✗ 简单单 Agent 问答（杀鸡用牛刀，直接调 LLM 即可）
```

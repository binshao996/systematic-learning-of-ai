# ReactFlow 工作流编辑器 — 实践详解

> 基于 ReactFlow 11 构建可视化工作流编辑器。从自定义节点、多类型拖拽、画布交互、状态管理到持久化，完整拆解实现细节。

---

## 1. ReactFlow 基础

### 1.1 为什么选择 ReactFlow？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **ReactFlow** | 自定义节点、内置 Handle/Edge、MiniMap/Controls、活跃维护 | 包体积较大 |
| **自建 Canvas** | 完全控制 | 工作量大，连线逻辑复杂 |
| **react-diagrams** | 功能齐全 | 文档差，更新慢 |
| **xyflow (ReactFlow v12)** | 更现代 | 当时未发布稳定版 |

ReactFlow 11 提供了开箱即用的核心能力：
- **自定义 Node 组件** — 每种节点类型独立 React 组件
- **Handle 系统** — target/source 半圆形连接点，自动管理连线
- **事件系统** — onConnect、onDrop、onNodesChange、onEdgesChange
- **内置 UI** — Controls（缩放按钮）、MiniMap（缩略图）、Background（网格背景）

### 1.2 核心概念

```
ReactFlow 实例
├── nodes: Node[]           — 画布上的节点列表
│   ├── id                  — 唯一标识
│   ├── type                — 节点类型 (startNode/endNode/agentNode/codeNode)
│   ├── position: {x, y}   — 画布坐标
│   └── data: {}            — 节点自定义数据
│
├── edges: Edge[]           — 连线列表
│   ├── id                  — 唯一标识
│   ├── source              — 源节点 ID
│   ├── target              — 目标节点 ID
│   ├── animated?           — 动画边（条件边）
│   └── style?              — 样式（条件边黄色）
│
└── nodeTypes: {}           — 节点类型 → React 组件映射
```

---

## 2. 自定义节点实现

### 2.1 节点注册

```typescript
// frontend/src/app/workflows/[id]/page.tsx

const nodeTypes = {
  startNode: StartNode,
  endNode: EndNode,
  agentNode: AgentNode,
  codeNode: CodeNode,
};
```

### 2.2 StartNode — 入口节点

```typescript
// frontend/src/components/workflow/StartNode.tsx

export const StartNode = memo(function StartNode({ data, selected }: NodeProps<StartNodeData>) {
  return (
    <div className={cn(
      "rounded-xl border-2 bg-white shadow-sm min-w-[140px]",
      selected && "border-green-500 ring-2 ring-green-100",
      !selected && "border-green-300",
    )}>
      {/* 只有 source handle，没有 target — 不接受上游输入 */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-green-100 flex items-center justify-center">
            <Play className="h-4 w-4 text-green-600" />
          </div>
          <span className="font-medium text-sm">{data.label}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400" />
    </div>
  );
});
```

**设计要点：**
- 只暴露 source handle（Bottom），不接受输入
- 绿色主题，Play 图标
- `memo` 包裹避免无关更新导致重渲染

### 2.3 EndNode — 出口节点

```typescript
// frontend/src/components/workflow/EndNode.tsx

export const EndNode = memo(function EndNode({ data, selected }: NodeProps<EndNodeData>) {
  return (
    <div className={cn(
      "rounded-xl border-2 bg-white shadow-sm min-w-[140px]",
      selected && "border-red-400 ring-2 ring-red-100",
      !selected && "border-red-300",
    )}>
      {/* 只有 target handle，没有 source — 不向下游输出 */}
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-red-100 flex items-center justify-center">
            <Square className="h-3.5 w-3.5 text-red-600" />
          </div>
          <span className="font-medium text-sm">{data.label}</span>
        </div>
      </div>
    </div>
  );
});
```

**设计要点：**
- 只暴露 target handle（Top），不向下游输出
- 红色主题，Square 图标

### 2.4 AgentNode — LLM Agent 节点

```typescript
// frontend/src/components/workflow/agent-node.tsx

interface AgentNodeData {
  label: string;
  agentName: string;
  agentId: string;
  isRunning?: boolean;      // 当前是否正在执行
  isCompleted?: boolean;     // 是否已完成
}

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <div className={cn(
      "rounded-xl border-2 bg-white shadow-sm min-w-[180px]",
      selected && "border-blue-400 ring-2 ring-blue-100",
      !selected && "border-zinc-200",
      data.isRunning && "border-amber-400 ring-2 ring-amber-100",
      data.isCompleted && "border-green-400"
    )}>
      <Handle type="target" position={Position.Top} className="!bg-zinc-400" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center",
            data.isRunning && "bg-amber-100",
            data.isCompleted && "bg-green-100",
            !data.isRunning && !data.isCompleted && "bg-zinc-100"
          )}>
            {data.isRunning ? (
              <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
            ) : (
              <Bot className="h-4 w-4 text-zinc-500" />
            )}
          </div>
          <span className="font-medium text-sm truncate">{data.label}</span>
        </div>
        <p className="text-xs text-zinc-400 truncate">{data.agentName}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-400" />
    </div>
  );
});
```

**设计要点：**
- 同时有 target 和 source handle
- 运行时橙色高亮 + 旋转图标
- 完成时绿色边框
- 显示 agent 名称作为副标题
- `memo` 优化渲染（工作流节点数量多时关键）

### 2.5 节点状态同步

```typescript
// 画布节点与运行时状态绑定

const { running, events, done, currentNodeId } = useWorkflowRun();

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

**匹配逻辑：**
- Agent 节点通过 `n.data.agentId` 匹配
- Start/End 节点通过 `n.id` 匹配（runner 中 node_start 事件的 agentId = node.id）

---

## 3. 拖拽系统

### 3.1 两种拖拽类型

```
左侧面板                            画布
┌──────────────┐                   ┌──────────────────┐
│ Start [拖]   │ ── drag ────────▶│                  │
│ End [拖]     │  "application/   │  onDrop() 处理    │
│ Agents:      │   nodetype"      │                  │
│  分析Agent[拖]│ ── drag ────────▶│  "application/   │
│  代码Agent[拖]│  "application/   │   agent"         │
└──────────────┘   agent"         └──────────────────┘
```

### 3.2 面板端 — 设置拖拽数据

```typescript
// frontend/src/components/workflow/agent-panel.tsx

// 内置节点 — 传递类型名
const onNodeDragStart = (e: React.DragEvent, nodeType: string) => {
  e.dataTransfer.setData("application/nodetype", nodeType);
  e.dataTransfer.effectAllowed = "move";
};

// Agent 节点 — 传递完整 Agent 数据
const onDragStart = (e: React.DragEvent, agent: Agent) => {
  e.dataTransfer.setData("application/agent", JSON.stringify(agent));
  e.dataTransfer.effectAllowed = "move";
};
```

### 3.3 画布端 — 接收拖放

```typescript
// frontend/src/app/workflows/[id]/page.tsx

const onDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  if (!rfInstance || !reactFlowWrapper.current) return;

  // 计算画布坐标
  const bounds = reactFlowWrapper.current.getBoundingClientRect();
  const position = rfInstance.project({
    x: e.clientX - bounds.left,
    y: e.clientY - bounds.top,
  });
  const nodeId = `node_${Date.now()}`;

  // 检查 Agent 拖入
  const agentRaw = e.dataTransfer.getData("application/agent");
  if (agentRaw) {
    const agent: Agent = JSON.parse(agentRaw);
    setNodes((nds) => [
      ...nds,
      {
        id: nodeId,
        type: "agentNode",
        position,
        data: { label: agent.name, agentName: agent.name, agentId: agent.id },
      },
    ]);
    return;
  }

  // 检查内置节点拖入
  const nodeType = e.dataTransfer.getData("application/nodetype");
  if (nodeType) {
    const labels: Record<string, string> = { start: "Start", end: "End", code: "Code" };
    const nodeTypeMap: Record<string, string> = { start: "startNode", end: "endNode", code: "codeNode" };
    setNodes((nds) => [
      ...nds,
      {
        id: nodeId,
        type: nodeTypeMap[nodeType],
        position,
        data: { label: labels[nodeType] },
      },
    ]);
  }
}, [rfInstance]);
```

**核心流程：**
1. 通过 `e.dataTransfer.getData()` 检查两种 MIME type
2. 使用 `rfInstance.project()` 将屏幕坐标转为画布坐标
3. 生成唯一 nodeId，创建 Node 对象加入 nodes 数组
4. Agent 拖入携带完整 agent 数据；内置节点只携带类型名

---

## 4. 连线与边管理

### 4.1 连线事件

```typescript
const onConnect = useCallback(
  (conn: Connection) => setEdges((eds) => addEdge({ ...conn, animated: false }, eds)),
  []
);
```

ReactFlow 内置 `addEdge` 工具函数，自动生成唯一 edgeId。

### 4.2 保存

```typescript
const handleSave = async () => {
  const nodeTypeToType: Record<string, string> = {
    startNode: "start",
    endNode: "end",
    agentNode: "agent",
    codeNode: "code",
  };

  const flowNodes = nodes.map((n) => ({
    id: n.id,
    type: nodeTypeToType[n.type || "agentNode"] || "agent",  // 前端 type → 后端 type
    agentId: n.data.agentId || undefined,
    label: n.data.label,
    position: n.position,
    content: n.data.content || undefined,
  }));

  const flowEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
  }));

  await apiFetch(`/api/workflows/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, nodes: flowNodes, edges: flowEdges }),
  });
};
```

### 4.3 加载

```typescript
// 后端 type → 前端 nodeType 映射
const typeToNodeType: Record<string, string> = {
  start: "startNode",
  end: "endNode",
  agent: "agentNode",
  code: "codeNode",
};

const loadedNodes = (wf.nodes || []).map((n) => ({
  id: n.id,
  type: typeToNodeType[n.type] || "agentNode",
  position: n.position,
  data: {
    label: n.label,
    agentName: "",
    agentId: n.agentId || "",
    content: n.content || "",
  },
}));

// 只为 agent 类型节点解析 agent 名称
const agentNodeIds = loadedNodes.filter(
  (n) => n.type === "agentNode" && n.data.agentId
);
if (agentNodeIds.length > 0) {
  apiFetch<Agent[]>("/api/agents").then((agents) => {
    const map = new Map(agents.map((a) => [a.id, a.name]));
    setNodes(loadedNodes.map((n) => {
      if (n.type === "agentNode") {
        return { ...n, data: { ...n.data, agentName: map.get(n.data.agentId) || "Unknown" } };
      }
      return n;
    }));
  });
}
```

**类型映射关系：**

```
前端 ReactFlow nodeType    后端 WorkflowNode.type
───────────────────────    ──────────────────────
startNode               →  "start"
endNode                 →  "end"
agentNode               →  "agent"
codeNode                →  "code"
```

---

## 5. 运行控制台

### 5.1 可拖拽宽度面板

```typescript
// frontend/src/components/workflow/run-console.tsx

export function RunConsole(...) {
  const [width, setWidth] = useState(384);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(320, Math.min(800, newWidth)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div style={{ width }}>
      <div onMouseDown={onMouseDown}
           className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize" />
      ...
    </div>
  );
}
```

### 5.2 事件展示与 Markdown 渲染

```typescript
function EventCard({ event }: { event: RunEvent }) {
  switch (event.type) {
    case "agent_output":
    case "node_output":
      return (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-medium text-zinc-500">{event.agentName}</span>
          </div>
          <MarkdownContent content={event.content || ""} />
        </div>
      );
    // ... 其他事件类型
  }
}
```

---

## 6. 布局结构

```
┌──────────────────────────────────────────────────────────────┐
│ WorkflowToolbar (名称 | Save | Run 按钮)                     │
├────────┬─────────────────────────────┬───────────────────────┤
│ Panel  │ Canvas (ReactFlow)          │ RunConsole (可拖拽)    │
│ w-56   │ flex-1                      │ 320px ~ 800px        │
│        │                             │                       │
│ Nodes  │  ┌───┐    ┌────────┐  ┌──┐ │ ┌─────────────────┐  │
│ ────── │  │ S │───▶│ Agent  │─▶│ E│ │ │ Header          │  │
│ Start  │  └───┘    └────────┘  └──┘ │ │ Input textarea  │  │
│ End    │       Controls  MiniMap    │ │ Run/Stop button │  │
│ ────── │                           │ │ Events list     │  │
│ Agents │                           │ │  + Markdown     │  │
│ agt-1  │                           │ │                 │  │
│ agt-2  │                           │ └─────────────────┘  │
└────────┴─────────────────────────────┴───────────────────────┘
```

---

## 7. ReactFlow 配置

```typescript
<ReactFlow
  nodes={activeNodes}                          // 含运行时状态的节点
  edges={edges}
  onNodesChange={onNodesChange}                // 拖拽移动
  onEdgesChange={onEdgesChange}                // 删除连线
  onConnect={onConnect}                        // 新建连线
  onInit={setRfInstance}                       // 获取实例（用于 project 坐标转换）
  onDragOver={onDragOver}                      // 允许拖放
  onDrop={onDrop}                              // 处理拖放
  nodeTypes={nodeTypes}                        // 自定义节点注册
  fitView                                      // 自动适配视图
  deleteKeyCode={["Backspace", "Delete"]}     // 键盘删除
>
  <Controls />                                  {/* 缩放控制 */}
  <MiniMap nodeColor={...} />                  {/* 缩略图，节点按状态着色 */}
  <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
</ReactFlow>
```

**MiniMap 节点着色：**

```typescript
<MiniMap
  nodeColor={(n) =>
    n.data.isRunning ? "#f59e0b" :
    n.data.isCompleted ? "#22c55e" :
    "#e4e4e7"
  }
/>
```

---

## 8. 总结

```
ReactFlow 工作流编辑器架构:

  节点系统:
    - 4 种自定义节点 (Start/End/Agent/Code)
    - memo 优化渲染
    - Handle 控制输入输出方向
    - 运行时状态高亮 (isRunning/isCompleted)

  拖拽系统:
    - 两种 MIME type: application/agent + application/nodetype
    - rfInstance.project() 坐标转换
    - Date.now() 生成唯一 nodeId

  持久化:
    - 前端 nodeType ↔ 后端 type 双向映射
    - 加载时仅为 agent 节点查询名称
    - 位置、内容、关联 agentId 全部保存

  状态同步:
    - currentNodeId 匹配 → 运行中高亮
    - agent_output/node_output 事件 → 完成标记
```

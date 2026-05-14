# Agent 模板市场

> 基于 Drizzle ORM + Next.js，从模板 Schema 设计、启动时自动播种、模板查询 API、前端模板卡片 "Use Template" 一键创建到 immutable template 的设计决策，完整拆解模板市场实现。

---

## 1. 为什么需要模板市场？

### 1.1 问题

创建 Agent 需要填写 system prompt、选择模型、调整参数。对新手用户，这些配置有门槛：

```
新手: "我想创建一个能审查代码的 Agent"
现状: 需要自己写 system prompt → 不知道怎么写 → 放弃
```

模板市场提供预配置的 Agent 起点，用户一键复制即可开始使用。

### 1.2 设计目标

```
1. 内置模板 — 系统预置 5 个常用 Agent 模板
2. 不可变 — 模板本身不可编辑（防止模板漂移）
3. 一键使用 — "Use Template" 创建副本，预填表单
4. 分类浏览 — 按 category 分组
5. 启动播种 — 后端启动时自动创建模板（幂等）
```

---

## 2. 数据库设计

### 2.1 Schema 变更

```typescript
// backend/src/db/schema.ts
export const agents = pgTable("agents", {
  // ... 原有字段
  isTemplate: boolean("is_template").default(false),  // 是否为模板
  category: text("category"),                          // 分类：Development, Writing, Data...
});
```

两个新增字段：

| 字段 | 类型 | 默认值 | 用途 |
|------|------|--------|------|
| `is_template` | boolean | false | 标记模板（true）vs 用户 Agent（false） |
| `category` | text | null | 模板分类，前端分组展示 |

### 2.2 查询隔离

```
普通 Agent 查询:  SELECT * FROM agents WHERE is_template = false
模板查询:         SELECT * FROM agents WHERE is_template = true
按分类查询:       SELECT * FROM agents WHERE is_template = true AND category = 'Development'
```

```typescript
// routes/agents.ts — 普通 Agent 列表排除模板
workflowsRoute.get("/", async (c) => {
  const result = await db.select().from(agents)
    .where(eq(agents.isTemplate, false))  // 只返回用户 Agent
    .orderBy(agents.updatedAt);
  return c.json(result);
});

// 模板专用端点
workflowsRoute.get("/templates", async (c) => {
  const category = c.req.query("category");
  let query = db.select().from(agents).where(eq(agents.isTemplate, true));
  if (category) query = query.where(eq(agents.category, category));
  const result = await query;
  return c.json(result);
});
```

---

## 3. 模板播种机制

### 3.1 启动时自动创建

```typescript
// backend/src/services/tools/registry.ts

const TEMPLATE_AGENTS: TemplateAgent[] = [
  {
    name: "Code Reviewer",
    description: "Reviews code for bugs, style violations, security issues...",
    category: "Development",
    systemPrompt: `You are an expert code reviewer. When given code:
1. Identify bugs, logic errors, and edge cases
2. Check for security vulnerabilities (SQL injection, XSS, unsafe eval, etc.)
3. Suggest style and readability improvements
...`,
    toolNames: [],
  },
  {
    name: "Copy Editor",
    category: "Writing",
    systemPrompt: `You are a professional copy editor...`,
    toolNames: [],
  },
  {
    name: "Data Translator",
    category: "Data",
    systemPrompt: `You are a data format translator...`,
    toolNames: [],
  },
  {
    name: "Research Assistant",
    category: "Research",
    systemPrompt: `You are a thorough research assistant...`,
    toolNames: ["web_search"],
  },
  {
    name: "Math Tutor",
    category: "Education",
    systemPrompt: `You are a patient math tutor...`,
    toolNames: ["calculator"],
  },
];

export async function seedTemplateAgents() {
  for (const tpl of TEMPLATE_AGENTS) {
    const existing = await db.select({ id: agents.id })
      .from(agents)
      .where(eq(agents.name, tpl.name));
    if (existing.length === 0) {
      await db.insert(agents).values({
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        systemPrompt: tpl.systemPrompt,
        isTemplate: true,
        toolIds: tpl.toolNames,
        model: "deepseek-chat",
        temperature: 0.3,
        maxTokens: 2048,
      });
      console.log(`Seeded template: ${tpl.name}`);
    }
  }
}
```

### 3.2 幂等保证

```
seedTemplateAgents() 启动时调用
  │
  ├── 检查 name 是否已存在
  │     ├── 存在 → 跳过（幂等）
  │     └── 不存在 → INSERT
  │
  └── 多次启动不会重复创建
```

```typescript
// backend/src/index.ts
import { seedTemplateAgents } from "./services/tools/registry";

// 启动时执行（不阻塞服务器启动）
seedTemplateAgents().catch((err) => console.error("Template seeding failed:", err));
```

---

## 4. 前端模板浏览与使用

### 4.1 Tab 切换布局

```
┌─────────────────────────────────────────┐
│ [My Agents (3)]  [Templates (5)]        │  ← Tab 切换
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ │Code     │ │Copy     │ │Data     │    │
│ │Reviewer │ │Editor   │ │Translat.│    │
│ │         │ │         │ │         │    │
│ │[Use Tpl]│ │[Use Tpl]│ │[Use Tpl]│    │
│ └─────────┘ └─────────┘ └─────────┘    │
└─────────────────────────────────────────┘
```

```typescript
// frontend/src/app/agents/page.tsx
const [tab, setTab] = useState<"agents" | "templates">("agents");

// Tab 切换
<div className="flex gap-1 mb-6 bg-zinc-100 rounded-lg p-1 w-fit">
  <button onClick={() => setTab("agents")}
    className={tab === "agents" ? "bg-white shadow-sm" : "text-zinc-500"}>
    My Agents ({agents.length})
  </button>
  <button onClick={() => setTab("templates")}
    className={tab === "templates" ? "bg-white shadow-sm" : "text-zinc-500"}>
    Templates ({templates.length})
  </button>
</div>
```

### 4.2 "Use Template" 一键创建

```
点击 "Use Template"
  │
  ├── 提取模板配置（不含 id）
  │     presetAgent = {
  │       name: tpl.name,
  │       systemPrompt: tpl.systemPrompt,
  │       model: tpl.model,
  │       temperature: tpl.temperature,
  │       ...  // 注意：没有 id 字段
  │     }
  │
  ├── 打开 AgentForm，预填所有字段
  │     form.name = presetAgent.name
  │     form.systemPrompt = presetAgent.systemPrompt
  │     ...
  │
  └── 用户修改 → 保存 → POST /api/agents（创建新 Agent）
       模板原版不受影响
```

```typescript
// frontend/src/app/agents/page.tsx
const handleUseTemplate = (tpl: Agent) => {
  setPresetAgent({
    name: tpl.name,
    description: tpl.description,
    systemPrompt: tpl.systemPrompt,
    model: tpl.model,
    temperature: tpl.temperature,
    maxTokens: tpl.maxTokens,
    toolIds: tpl.toolIds,
    // 注意：不传 id — 这决定 AgentForm 走 POST（创建）而非 PATCH（更新）
  });
  setShowForm(true);
};
```

### 4.3 AgentForm 的创建/更新判断

```typescript
// frontend/src/components/agents/agent-form.tsx
const handleSubmit = async (e: React.FormEvent) => {
  if (agent?.id) {
    // PATCH — 更新已有 Agent
    await apiFetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      body: JSON.stringify(form),
    });
    toast.success("Agent updated");
  } else {
    // POST — 创建新 Agent（包括从模板创建）
    const created = await apiFetch<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify(form),
    });
    toast.success("Agent created");
    router.push(`/agents/${created.id}`);
  }
};
```

关键设计：`agent?.id` 判断。模板 preset 没有 `id`，所以走 POST 创建路径。

---

## 5. 模板不可变设计

### 5.1 为什么模板不可变？

```
场景 A（可变模板）:
  用户 A 修改 "Code Reviewer" 模板的 system prompt
  → 用户 B 使用模板 → 拿到被修改过的版本
  → 模板质量不可控，"市场"信任崩塌

场景 B（不可变模板）:
  用户点击 "Use Template"
  → 创建独立副本
  → 用户可随意修改自己的副本
  → 模板始终保持原始质量
```

### 5.2 实现

```
┌─────────────────────┐       ┌─────────────────────┐
│ Template (不可变)    │       │ User Agent (可编辑)  │
│                     │       │                     │
│ isTemplate: true    │  Use  │ isTemplate: false   │
│ id: tpl-xxx         │──Tpl──▶ id: agent-yyy       │
│ name: Code Reviewer │       │ name: My Reviewer   │
│ prompt: ...         │       │ prompt: ... (可改)  │
│                     │       │                     │
│ 不暴露编辑入口       │       │ 有编辑/删除按钮     │
└─────────────────────┘       └─────────────────────┘
```

前端 Agent 列表页不显示模板的编辑/删除按钮（`AgentCard` 根据 `isTemplate` 控制操作入口）。

---

## 6. 数据流总结

```
启动时:
  seedTemplateAgents()
    → 检查 name 是否存在 → INSERT (is_template=true)

运行时:
  GET /api/agents/templates
    → WHERE is_template = true
    → 前端 Templates tab

用户点击 Use Template:
  → presetAgent (无 id)
  → AgentForm 预填
  → 保存时 POST /api/agents（创建新记录）

普通 Agent 列表:
  GET /api/agents
    → WHERE is_template = false
    → 只返回用户创建的 Agent
```

---

## 7. 扩展方向

```
1. 社区模板 — 用户可将自己创建的 Agent 发布为模板
2. 模板版本 — 模板更新后，已使用用户收到通知
3. 模板评分 — 使用次数、点赞、评论
4. 模板参数化 — 模板中预留 {{placeholder}}，使用时可替换
5. 分类搜索 — 全文搜索模板名/描述/分类
```

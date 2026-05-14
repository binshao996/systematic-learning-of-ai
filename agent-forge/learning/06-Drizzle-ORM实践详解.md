# Drizzle ORM 实践详解

> 基于 Drizzle ORM v0.45 + PostgreSQL + postgres-js，从连接配置、Schema 定义、CRUD 查询、JSONB 操作、迁移管理到实战模式，完整拆解 Agent Forge 中的数据库层实现。

---

## 1. 为什么选 Drizzle ORM？

### 1.1 ORM 选型对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Drizzle ORM** | SQL-like 语法、类型安全、无代码生成、JSONB 原生支持 | 生态较新、社区相对小 |
| **Prisma** | 声明式 Schema、自动迁移、Prisma Studio | 需要 `prisma generate`、自定义 SQL 支持弱、包体积大 |
| **Kysely** | 类型安全 SQL builder、轻量 | 无 Migration 工具、需手写 SQL |
| **TypeORM** | Active Record / Data Mapper 模式、装饰器丰富 | 装饰器依赖 TypeScript 实验特性、性能一般 |
| **原生 pg** | 完全控制、无抽象层 | 手写 SQL、无类型推断、易注入 |

### 1.2 选择 Drizzle 的理由

```
1. SQL-like 语法 — 写法接近 SQL，学习成本低
   db.select().from(agents).where(eq(agents.id, id))
   vs
   SELECT * FROM agents WHERE id = $1

2. 零代码生成 — 不需要 prisma generate，Schema 即 TypeScript 对象
   Drizzle 的类型系统在编译时推断，无需额外构建步骤

3. JSONB 一等公民 — PostgreSQL jsonb 列直接映射为 TS 类型
   toolIds: jsonb("tool_ids").default([]) → TS 中直接当 string[] 用

4. 轻量 — 核心包 ~100KB，是 Prisma Client 的 1/10
```

### 1.3 与 Prisma 的关键差异

```
Prisma 模式:                           Drizzle 模式:
  schema.prisma (DSL)                    schema.ts (TypeScript)
       │                                      │
  prisma generate                           直接 import
       │                                      │
  @prisma/client (生成的)                   drizzle-orm (库)
       │                                      │
  运行时查询                               运行时查询

Prisma: 声明式 DSL → 代码生成 → 类型安全的 Client
Drizzle: TypeScript Schema → 库内类型推断 → 直接用
```

Prisma 的 DSL 需要额外学习，而且 `prisma generate` 在某些 CI 环境中是个痛点。Drizzle 的纯 TypeScript 方案更契合前端全栈开发者的技能栈。

---

## 2. 环境配置与连接

### 2.1 依赖

```json
{
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "postgres": "^3.4.9"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.10"
  }
}
```

三个包的职责：

| 包 | 用途 |
|----|------|
| `drizzle-orm` | 运行时：Schema 定义、查询构建、类型推断 |
| `drizzle-kit` | 开发时：Migration 生成、数据库内省 |
| `postgres` | 驱动：PostgreSQL 网络协议、连接池 |

### 2.2 数据库连接

```typescript
// backend/src/db/connection.ts

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";

const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient);
```

**选择 `postgres-js` 驱动的理由：**

Drizzle 支持多种 Postgres 驱动：

| 驱动 | 特点 |
|------|------|
| `postgres-js` | 纯 JS 实现，零原生依赖，安装最快 |
| `pg` (node-postgres) | Node.js 标准驱动，生态最成熟 |
| `@vercel/postgres` | Vercel 托管优化，自动连接池 |
| `@neondatabase/serverless` | 兼容 HTTP fetch，适合 Serverless/Edge |

Agent Forge 用 Bun 运行时，`postgres-js` 兼容性最好，安装时不会遇到原生模块编译问题。

### 2.3 环境变量校验

```typescript
// backend/src/env.ts

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().default(
    "postgres://agentforge:agentforgepass@localhost:5433/agent_forge"
  ),
  // ... 其他变量
});

export const env = envSchema.parse(process.env);
```

**为什么用 Zod 校验环境变量？**

```
不用 Zod:                      用 Zod:
  process.env.DATABASE_URL       env.DATABASE_URL
  // 类型: string | undefined    // 类型: string（保证存在且有默认值）
  // 启动时报错在深层代码中         // 启动时立即报错在 env.ts
```

Zod 的 `.default()` 让开发环境不需要手动设置每个变量，生产环境通过 `process.env` 注入即可覆盖。`z.coerce.number()` 把字符串 `"3002"` 自动转为数字类型。

---

## 3. Schema 定义

### 3.1 核心类型速查

Drizzle 的 `pg-core` 导出所有 PostgreSQL 列类型：

```typescript
import {
  pgTable,       // 定义表
  uuid,          // UUID 类型
  text,          // TEXT 类型
  real,          // REAL (float4) 类型
  integer,       // INTEGER 类型
  boolean,       // BOOLEAN 类型
  timestamp,     // TIMESTAMP 类型
  jsonb,         // JSONB 类型
} from "drizzle-orm/pg-core";
```

| Drizzle 类型 | PostgreSQL 类型 | TypeScript 推断 |
|-------------|----------------|----------------|
| `uuid()` | `UUID` | `string` |
| `text()` | `TEXT` | `string` |
| `integer()` | `INTEGER` | `number` |
| `real()` | `REAL` / `float4` | `number` |
| `boolean()` | `BOOLEAN` | `boolean` |
| `timestamp()` | `TIMESTAMP` | `Date` |
| `jsonb()` | `JSONB` | 由 `default()` 和 `$type<>()` 决定 |

### 3.2 表定义实战

**agents 表 — 展示核心列修饰符：**

```typescript
// backend/src/db/schema.ts

export const agents = pgTable("agents", {
  // 主键：UUID 自动生成
  id: uuid("id").defaultRandom().primaryKey(),

  // 必填文本字段
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),

  // 可选文本字段
  description: text("description"),

  // 带默认值的字段
  model: text("model").default("deepseek-chat"),
  temperature: real("temperature").default(0.3),
  maxTokens: integer("max_tokens").default(2048),

  // JSONB 数组
  toolIds: jsonb("tool_ids").default([]),

  // 时间戳
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**字段修饰符说明：**

| 修饰符 | 作用 | 示例 |
|--------|------|------|
| `.primaryKey()` | 主键约束 | `id: uuid("id").primaryKey()` |
| `.defaultRandom()` | 随机 UUID（Postgres `gen_random_uuid()`） | `id: uuid("id").defaultRandom()` |
| `.notNull()` | NOT NULL 约束 | `name: text("name").notNull()` |
| `.default(value)` | 默认值 | `temperature: real("temperature").default(0.3)` |
| `.defaultNow()` | 默认当前时间戳 | `createdAt: timestamp("created_at").defaultNow()` |
| `.unique()` | UNIQUE 约束 | `name: text("name").notNull().unique()` |
| `.references()` | 外键约束 | `workflowId: uuid("workflow_id").references(() => workflows.id)` |

**tools 表 — 展示 unique 和 boolean：**

```typescript
export const tools = pgTable("tools", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),       // 工具名全局唯一
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("builtin"),
  inputSchema: jsonb("input_schema").notNull(), // 必填 JSONB
  config: jsonb("config").default({}),          // 可选 JSONB
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**workflows 表 — JSONB 存图结构：**

```typescript
export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // 整张图存 JSONB — 节点数组 + 边数组
  nodes: jsonb("nodes").notNull().default([]),
  edges: jsonb("edges").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**runs 表 — 展示外键：**

```typescript
export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  // 外键引用 workflows 表
  workflowId: uuid("workflow_id").references(() => workflows.id),
  status: text("status").notNull().default("pending"),
  input: text("input").notNull(),
  output: text("output"),
  traceEvents: jsonb("trace_events").default([]),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

**注意：** `.references(() => workflows.id)` 用箭头函数（lazy reference）是为了解决循环引用——当 `workflows` 表定义在 `runs` 之后时，直接引用会报 `undefined`。

### 3.3 列名映射

Drizzle 使用 `camelCase` 在 JS 侧，`snake_case` 在数据库侧：

```
TypeScript 侧 (camelCase)          PostgreSQL 侧 (snake_case)
  agents.systemPrompt           →    agents.system_prompt
  agents.maxTokens              →    agents.max_tokens
  agents.createdAt              →    agents.created_at
  tools.displayName             →    tools.display_name
  tools.inputSchema             →    tools.input_schema
  runs.workflowId               →    runs.workflow_id
  runs.traceEvents              →    runs.trace_events
```

`pgTable` 的第二个参数（如 `"system_prompt"`）是数据库列名，JS 侧通过属性名访问。这个映射是手动的，Drizzle 不会自动转换命名风格。

### 3.4 没有使用 Relations API

Agent Forge 的 Schema 中 **没有定义 `relations()`**。Drizzle 的 Relations API 用于声明表间关联，支持 `.findMany()` 和 `.with()` 风格的关联查询：

```typescript
// Drizzle Relations API (本项目没用的模式)
export const agentsRelations = relations(agents, ({ many }) => ({
  runs: many(runs),
}));

// 查询时可以
const result = await db.query.agents.findMany({
  with: { runs: true },  // 自动 join
});
```

**不用 Relations 的理由：**
- 项目规模小，4 张表，关联查询需求少
- 单表查询足够覆盖所有场景
- Workflow 的 nodes/edges 已通过 JSONB 反规范化，无需 join
- 保持简单——需要关联时直接写子查询或用 `db.select()` 手动 join

---

## 4. 查询模式大全

### 4.1 SELECT — 全表查询

```typescript
import { eq, desc } from "drizzle-orm";

// 全表查询 + 排序
const allAgents = await db.select().from(agents).orderBy(agents.updatedAt);
// SQL: SELECT * FROM agents ORDER BY updated_at

const allTools = await db.select().from(tools).orderBy(tools.name);
// SQL: SELECT * FROM tools ORDER BY name

// 全表查询 + 降序 + 限制
const recentRuns = await db
  .select()
  .from(runs)
  .orderBy(desc(runs.createdAt))
  .limit(50);
// SQL: SELECT * FROM runs ORDER BY created_at DESC LIMIT 50
```

### 4.2 SELECT — 条件查询 (WHERE)

```typescript
// 按主键查单条
const [agent] = await db
  .select()
  .from(agents)
  .where(eq(agents.id, agentId));
// SQL: SELECT * FROM agents WHERE id = $1
// [agent] 解构：db.select() 总是返回数组

// 按名称查（唯一约束）
const [existing] = await db
  .select({ id: tools.id })           // 只查 id 列
  .from(tools)
  .where(eq(tools.name, "calculator"));
// SQL: SELECT id FROM tools WHERE name = $1
```

**为什么用 `const [agent]` 解构赋值？**

Drizzle 的 `.select()` 总是返回数组，即使查主键也只可能返回 0 或 1 条。解构是约定：

```typescript
const [agent] = await db.select().from(agents).where(eq(agents.id, id));
// agent 类型: Agent | undefined

if (!agent) {
  // 处理 404
}
```

### 4.3 INSERT

```typescript
// 插入 + 返回新行
const [newAgent] = await db
  .insert(agents)
  .values({
    name: body.name,
    description: body.description || null,
    systemPrompt: body.systemPrompt,
    model: body.model || "deepseek-chat",
    temperature: body.temperature ?? 0.3,
    maxTokens: body.maxTokens ?? 2048,
    toolIds: body.toolIds || [],
  })
  .returning();
// SQL: INSERT INTO agents (...) VALUES (...) RETURNING *
// .returning() 返回刚插入的完整行

// 批量插入（种子数据）
await db.insert(tools).values([
  { name: "calculator", displayName: "Calculator", /* ... */ },
  { name: "file_reader", displayName: "File Reader", /* ... */ },
  { name: "web_search", displayName: "Web Search", /* ... */ },
]);
// SQL: INSERT INTO tools (...) VALUES (...), (...), (...)
```

**`??` vs `||` 的区别：**

```typescript
temperature: body.temperature ?? 0.3    // 只有 undefined/null 时用默认值
maxTokens: body.maxTokens ?? 2048       // 0 是合法值，不能用 ||

description: body.description || null   // 空字符串也变成 null
```

`real` / `integer` 类型的 0 是合法值，必须用 `??`，否则 `temperature: 0` 会被 `|| 0.3` 覆盖。

### 4.4 UPDATE

```typescript
// 更新 + 返回新行
const [updated] = await db
  .update(workflows)
  .set({
    name: body.name,
    nodes: body.nodes,
    edges: body.edges,
    updatedAt: new Date(),
  })
  .where(eq(workflows.id, id))
  .returning();
// SQL: UPDATE workflows SET ... WHERE id = $1 RETURNING *

// 异步更新（不等结果）
db.update(runs)
  .set({ traceEvents: allEvents })
  .where(eq(runs.id, runId))
  .execute()
  .catch(() => {});  // 静默失败
// SQL: UPDATE runs SET trace_events = $1 WHERE id = $2
```

**两种更新模式：**

| 模式 | 用法 | 场景 |
|------|------|------|
| `await ... .returning()` | 等返回，拿新数据 | 前端需要最新状态 |
| `db.update()...execute().catch()` | 不等返回，静默失败 | 后台写入日志、trace 追加 |

第二种模式用于 SSE 事件日志追加——事件推完就结束了，不等 DB 确认。`catch(() => {})` 防止写入失败导致整个请求崩溃。

### 4.5 DELETE

```typescript
await db.delete(workflows).where(eq(workflows.id, id));
// SQL: DELETE FROM workflows WHERE id = $1
```

### 4.6 常用操作符速查

```typescript
import { eq, ne, gt, gte, lt, lte, like, inArray, and, or, asc, desc } from "drizzle-orm";

// 等值
eq(agents.id, id)         // id = $1

// 不等于
ne(agents.status, "deleted")  // status != $1

// 范围
gt(agents.temperature, 0.5)   // temperature > $1
gte(agents.temperature, 0.5)  // temperature >= $1

// 模糊匹配
like(agents.name, "%测试%")    // name LIKE $1

// 数组包含
inArray(agents.id, ["id1", "id2"])  // id IN ($1, $2)

// 组合条件
and(eq(agents.model, "deepseek-chat"), gt(agents.temperature, 0.5))
// model = $1 AND temperature > $2

// 排序
orderBy(asc(agents.name))       // ORDER BY name ASC
orderBy(desc(agents.createdAt)) // ORDER BY created_at DESC
```

Agent Forge 实际只用到了 `eq` 和 `desc`——查询模式很简单，不需要复杂条件。

---

## 5. JSONB 操作实战

### 5.1 存储模式

Agent Forge 中 JSONB 有三种用法：

```
1. 简单数组（toolIds）
   agents.tool_ids = ["uuid-1", "uuid-2", "uuid-3"]
   TS 类型: string[]

2. 对象配置（config）
   tools.config = { "base_url": "https://...", "timeout": 30 }
   TS 类型: Record<string, unknown>

3. 富文档（nodes, edges, traceEvents）
   workflows.nodes = [{ id: "n1", type: "agent", position: { x: 100, y: 200 }, ... }]
   TS 类型: WorkflowNodeData[]
```

### 5.2 写入 JSONB

```typescript
// Drizzle 自动序列化 JS 对象为 JSONB —— 不需要 JSON.stringify
await db.insert(agents).values({
  name: "测试 Agent",
  systemPrompt: "你是一个助手",
  toolIds: ["uuid-calculator", "uuid-web-search"],  // TS 数组 → JSONB
});

await db.insert(workflows).values({
  name: "测试工作流",
  nodes: [
    { id: "n1", type: "start", label: "Start", position: { x: 100, y: 50 } },
    { id: "n2", type: "agent", agentId: "xxx", label: "分析", position: { x: 100, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
  ],
});
```

### 5.3 读取 JSONB

```typescript
// 读取后用 as 类型断言
const agent = await db.select().from(agents).where(eq(agents.id, id));
const toolIds = agent.toolIds as string[];  // JSONB 解析后是 unknown

// 工作流节点
const wf = await db.select().from(workflows).where(eq(workflows.id, id));
const nodes = wf.nodes as WorkflowNodeData[];
const edges = wf.edges as WorkflowEdgeData[];
```

**为什么用 `as` 而不是 Zod parse？**

```
方案 A: as 断言（当前）
  const nodes = wf.nodes as WorkflowNodeData[];
  风险：数据库里有脏数据会运行时崩溃

方案 B: Zod parse（更安全）
  const nodes = nodeArraySchema.parse(wf.nodes);
  优点：解析失败有明确错误信息
  缺点：每次读取都要解析，JSONB 数据量小时没必要
```

当前项目规模下用 `as` 足够。数据入口（API Route）已有 Zod 校验，数据库里不会出现脏数据。

### 5.4 JSONB 更新

```typescript
// 整体替换（当前做法）
await db.update(workflows)
  .set({ nodes: newNodes })
  .where(eq(workflows.id, id));

// PostgreSQL JSONB 部分更新（需要用 sql 模板）
import { sql } from "drizzle-orm";

await db.update(workflows)
  .set({
    nodes: sql`nodes || '${sql.raw(JSON.stringify(newNode))}'::jsonb`,
  })
  .where(eq(workflows.id, id));
```

Agent Forge 只用整体替换——节点/边的修改都在前端完成，保存时全量写入，不需要部分更新。

### 5.5 为什么不拆成关系表？

```
方案 A: JSONB（当前）
  一次 SELECT 拿整个工作流，无需 JOIN
  前端渲染直接可用，无需拼装

方案 B: 关系表
  workflow_nodes (id, workflow_id, type, agent_id, position_x, position_y, ...)
  workflow_edges (id, workflow_id, source, target, ...)
  需要 JOIN 两张表 + 前端拼装
```

选 JSONB 的核心逻辑：**一起读一起写的数据，存一个字段更自然**。工作流的节点和边永远一起加载，不存在"只查某一个节点"的场景，没有 JOIN 的必要。

---

## 6. 迁移管理

### 6.1 drizzle-kit 配置

```typescript
// backend/drizzle.config.ts

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",   // Schema 文件路径
  out: "./drizzle",               // 迁移文件输出目录
  dialect: "postgresql",          // 数据库方言
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "...",
  },
});
```

### 6.2 迁移工作流

```bash
# 1. 修改 src/db/schema.ts 后生成迁移
cd backend
bun run db:generate
# → 在 drizzle/ 下生成 0001_xxx.sql

# 2. 执行迁移
bun run db:migrate
# → drizzle-kit 读取 drizzle/meta/_journal.json
# → 按顺序执行未应用的 SQL 迁移文件
```

**package.json scripts：**

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
}
```

### 6.3 迁移文件结构

```
backend/drizzle/
├── 0000_thick_gwen_stacy.sql       # SQL 迁移文件
├── meta/
│   ├── _journal.json               # 迁移日志（记录已应用哪些版本）
│   └── 0000_snapshot.json          # Schema 快照（drizzle-kit 内部用）
```

### 6.4 首次迁移示例

```sql
-- drizzle/0000_thick_gwen_stacy.sql

CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "system_prompt" text NOT NULL,
  "model" text DEFAULT 'deepseek-chat',
  "temperature" real DEFAULT 0.3,
  "max_tokens" integer DEFAULT 2048,
  "tool_ids" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
-- ... 其他 3 张表类似
```

Drizzle Kit 从 `schema.ts` 推断当前 Schema 状态，对比上次快照，自动生成增量 SQL。

### 6.5 开发 vs 生产

```
开发环境:
  DATABASE_URL=postgres://localhost:5433/agent_forge
  bun run db:generate  # 改 Schema 后
  bun run db:migrate   # 应用到本地 DB

生产环境 / CI:
  DATABASE_URL=postgres://prod-host:5432/agent_forge
  bun run db:migrate   # 部署时自动执行未应用的迁移
```

`bun run db:migrate` 是幂等的——已应用的迁移不会重复执行（通过 `_journal.json` 跟踪）。

---

## 7. 种子数据

### 7.1 启动时种子

```typescript
// backend/src/services/tools/registry.ts

export async function seedTools() {
  for (const tool of BUILTIN_TOOLS) {
    // 检查是否已存在（幂等）
    const existing = await db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.name, tool.name));

    if (existing.length === 0) {
      await db.insert(tools).values({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        type: "builtin",
        inputSchema: tool.inputSchema,
        config: tool.config || {},
        enabled: true,
      });
    }
  }
}
```

### 7.2 幂等保证

通过 `where(eq(tools.name, tool.name))` 先查后插——工具名有 `unique()` 约束，重复启动不会创建重复数据。

### 7.3 调用时机

```typescript
// backend/src/index.ts
// 启动时自动种子内置工具
import { seedTools } from "./services/tools/registry";
seedTools().catch(console.error);
```

种子操作不阻塞服务启动——`.catch()` 确保种子失败不影响 API 可用性。

---

## 8. 常见问题与陷阱

### 8.1 `.returning()` 位置

```typescript
// 正确：.returning() 在 .where() 之后
await db.update(agents).set({ name: "new" }).where(eq(agents.id, id)).returning();

// 错误：.returning() 放在 .where() 之前
await db.update(agents).set({ name: "new" }).returning().where(eq(agents.id, id));
// → 类型错误
```

### 8.2 UUID 生成

```typescript
// Drizzle 层生成：.defaultRandom()
id: uuid("id").defaultRandom().primaryKey()
// → 生成 SQL: DEFAULT gen_random_uuid()
// → UUID 在数据库侧生成，JS 插入时不传 id

// 应用层生成：
import { v7 as uuidv7 } from "uuid";
await db.insert(agents).values({ id: uuidv7(), ... });
// → 需要额外依赖，一般不推荐
```

用 `.defaultRandom()` 让数据库生成 UUID，减少应用层依赖。

### 8.3 JSONB 默认值陷阱

```typescript
// 错误：.default([]) 会在所有行共享同一个数组引用（Drizzle 已处理此问题，但概念上需要知道）
// Drizzle 内部会序列化默认值，所以共享引用不是问题

// 正确：
toolIds: jsonb("tool_ids").default([])
// Drizzle 序列化为 SQL: DEFAULT '[]'::jsonb
```

### 8.4 时间戳更新

```typescript
// 创建时间：用 .defaultNow()
createdAt: timestamp("created_at").defaultNow()

// 更新时间：手动传 new Date()
await db.update(agents).set({
  name: "new",
  updatedAt: new Date(),  // ← 需要手动传
}).where(eq(agents.id, id));
```

PostgreSQL 没有原生的 `ON UPDATE CURRENT_TIMESTAMP`，Drizzle 也不自动更新 `updatedAt`，需要手动传。

---

## 9. 总结

```
Drizzle ORM 使用全景:

  连接层:
    postgres(DATABASE_URL) → drizzle(client) → db 实例

  Schema 层:
    pgTable("table_name", { column: type("col").modifiers() })
    uuid / text / real / integer / boolean / timestamp / jsonb

  查询层:
    db.select() / db.insert() / db.update() / db.delete()
    .where(eq()) / .orderBy() / .limit() / .returning()

  JSONB 模式:
    一起读写的数据 → 存一个 JSONB 字段
    分散读的数据 → 拆列或拆表

  迁移:
    drizzle-kit generate → drizzle-kit migrate
    开发时生成、部署时执行、幂等保证

Agent Forge 中的实际用量:
  - 4 张表，单表 CRUD，无 JOIN
  - 主要操作符: eq, desc
  - JSONB 存工作流图结构 + 执行日志
  - 种子数据幂等插入
```

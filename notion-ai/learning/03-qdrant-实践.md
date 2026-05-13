# Qdrant 实战 — 结构化学习笔记

## 1. 客户端设置与连接

### 安装客户端

```bash
npm install @qdrant/js-client-rest
```

### 创建 QdrantClient 实例

连接到本地 Docker Qdrant 实例（默认 REST 端口 6333，gRPC 端口 6334）：

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({
  url: "http://localhost:6333",   // REST API
  // 若使用 gRPC，使用端口 6334:
  // url: "http://localhost:6334",
});
```

> **注意**: 端口 `6333` 是 REST API（`@qdrant/js-client-rest` 的默认端口）。端口 `6334` 是 gRPC 接口。REST 客户端通过 `6333` 通信。

### 使用 Docker 启动 Qdrant

```bash
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

- `6333` — REST API（健康检查、CRUD、搜索）
- `6334` — gRPC 接口
- `6335` — 内部集群通信（单节点不需要）

---

## 2. Collection 管理

### 创建 Collection

在插入任何 point 之前，必须创建带有向量配置的 collection。

```typescript
await client.createCollection("document_chunks", {
  vectors: {
    size: 1536,          // DeepSeek embedding 的维度
    distance: "Cosine",  // 距离度量: Cosine / Dot / Euclid
  },
});
```

**参数**:

| 字段 | 描述 |
|---|---|
| `vectors.size` | Embedding 向量的维度 |
| `vectors.distance` | 相似度度量（`Cosine`、`Dot`、`Euclid`） |
| `on_disk` | 将向量存储在磁盘上而非 RAM 中（默认 `false`） |

### 列出 Collection

```typescript
const collections = await client.getCollections();
for (const col of collections.collections) {
  console.log(col.name);
}
```

### 查看 Collection 信息

```typescript
const info = await client.getCollection("document_chunks");
console.log(info);
// {
//   status: "green",
//   optimizer_status: "ok",
//   vectors_count: 42,
//   points_count: 42,
//   ...
// }
```

### 删除 Collection

```typescript
await client.deleteCollection("document_chunks");
```

> 警告: 此操作不可逆。所有向量和 payload 都将被移除。

---

## 3. 插入与搜索向量

### Point 结构

Qdrant 中的 point 由以下部分组成：

- `id` — 唯一标识符（数字或 UUID）
- `vector` — embedding 数组
- `payload` — 任意 JSON 元数据

### 带 Payload 的 Upsert

```typescript
await client.upsert("document_chunks", {
  points: [
    {
      id: 1,
      vector: [0.012, -0.034, ..., 0.056],  // 1536 维数组
      payload: {
        docId: "doc_001",
        chunkIndex: 0,
        text: "Introduction to RAG...",
        headingPath: ["RAG Overview", "What is RAG?"],
        charStart: 0,
        charEnd: 120,
      },
    },
    {
      id: 2,
      vector: [0.045, 0.012, ..., -0.021],
      payload: {
        docId: "doc_001",
        chunkIndex: 1,
        text: "Embedding models convert text into vectors...",
        headingPath: ["RAG Overview", "Embedding Models"],
        charStart: 121,
        charEnd: 340,
      },
    },
  ],
});
```

### 单向量搜索

```typescript
const searchResult = await client.search("document_chunks", {
  vector: [0.023, -0.011, ..., 0.078],  // 查询 embedding
  limit: 5,
  with_payload: true,
});

for (const hit of searchResult) {
  console.log(`Score: ${hit.score}, Text: ${hit.payload?.text}`);
}
```

### 批量 Upsert 以提高效率

对于大批量导入任务，批量 upsert 通过在单个 HTTP 请求中发送多个 point 来大幅减少开销。

```typescript
const BATCH_SIZE = 100;

async function batchUpsert(
  collectionName: string,
  points: Array<{ id: number; vector: number[]; payload: Record<string, unknown> }>,
) {
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await client.upsert(collectionName, { points: batch });
    console.log(`Upserted batch ${i / BATCH_SIZE + 1} (${batch.length} points)`);
  }
}
```

> 指导原则：
> - 每次请求 100–500 个 point 是典型的批量大小
> - 批量太大导致请求超时；太小则浪费 HTTP 开销
> - 始终使用批量——逐条插入非常慢

---

## 4. 过滤与 Payload 操作

### 过滤搜索结果

过滤器按 payload 字段缩小搜索范围。Qdrant 使用声明式过滤语法：

```typescript
const result = await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [
      {
        key: "docId",
        match: { value: "doc_001" },
      },
    ],
  },
  limit: 10,
  with_payload: true,
});
```

**组合过滤器**（AND / OR）：

```typescript
const result = await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [
      { key: "docId", match: { value: "doc_001" } },
      { key: "chunkIndex", range: { gte: 0, lte: 5 } },
    ],
  },
  limit: 10,
});
```

**过滤条件**:

| 条件 | 语法 | 使用场景 |
|---|---|---|
| `match` | `{ value: "str" }` | 精确字符串匹配 |
| `match` | `{ value: 42 }` | 精确整数匹配 |
| `range` | `{ gte: 0, lte: 100 }` | 数值范围 |
| `must_not` | `[...]` | 否定过滤器 |
| `should` | `[...]` | OR 逻辑（至少匹配一个） |

### Payload 索引以加速过滤

没有索引时，过滤会扫描所有 point。对经常过滤的字段创建索引：

```typescript
// 在 docId 上创建 keyword 索引
await client.createPayloadIndex("document_chunks", {
  field_name: "docId",
  field_type: "keyword",
});

// 在 chunkIndex 上创建 integer 索引
await client.createPayloadIndex("document_chunks", {
  field_name: "chunkIndex",
  field_type: "integer",
});
```

**哪些字段需要索引**：
- `docId` → keyword 索引（用于将搜索范围限制在特定文档内）
- `chunkIndex` → integer 索引（用于对 chunk 进行排序）
- `headingPath` → keyword 索引（如果按标题过滤）
- `charStart` / `charEnd` → integer 索引（用于字符范围查询）

> 对不常过滤的字段跳过索引可以节省内存并减少写入延迟。

### Scroll API 分页

使用 `scroll` 遍历 collection 中的所有 point（或经过过滤的子集），无需向量搜索：

```typescript
async function scrollAllPoints(collectionName: string) {
  let offset: string | number | undefined = undefined;
  let allPoints: any[] = [];

  do {
    const result = await client.scroll(collectionName, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,  // 省略向量以提高速度
    });

    allPoints.push(...result.points);
    offset = result.next_page_offset;
  } while (offset !== null);

  return allPoints;
}
```

**关键选项**:

| 参数 | 描述 |
|---|---|
| `limit` | 每页大小（每次调用最大 1000） |
| `offset` | 下一页的游标 |
| `filter` | 可选的过滤器，用于限制滚动范围 |
| `with_payload` | 是否包含 payload 数据 |
| `with_vector` | 是否包含向量数据（仅操作 payload 时设为 `false`） |

**带过滤器的 scroll**：

```typescript
const result = await client.scroll("document_chunks", {
  filter: {
    must: [{ key: "docId", match: { value: "doc_001" } }],
  },
  limit: 50,
  with_payload: true,
  with_vector: false,
});
```

---

## 5. 本项目的 Collection 设计

### Document Chunks Schema

```
Collection: "document_chunks"
  - Vector size: 1536 (DeepSeek embedding 维度)
  - Distance: Cosine
  - Payload 字段:
    - docId: string (keyword 索引)
    - chunkIndex: integer (integer 索引)
    - text: string
    - headingPath: string[] (keyword 索引)
    - charStart: integer
    - charEnd: integer
```

### 设计理由

| 决策 | 原因 |
|---|---|
| **Vector size: 1536** | 匹配 `text-embedding-3-small` 的输出维度。如果切换到 DeepSeek（1024 维），需要更新 collection 配置 |
| **Distance: Cosine** | 文本 embedding 的标准度量。所有向量由 embedding 模型进行 L2 归一化 |
| **`docId` 作为 keyword 索引** | 主要过滤字段——每次搜索将范围限定在单个文档或已知文档集内 |
| **`chunkIndex` 作为 integer 索引** | 用于检索后重建 chunk 顺序，以及进行范围查询 |
| **`headingPath` 作为字符串数组** | 保留每个 chunk 的标题层级（例如 `["Section 1", "Subsection A"]`），用于上下文感知展示 |
| **`charStart` / `charEnd`** | 支持从原始文档中进行精确的字符级引用 |

### 典型查询模式

```typescript
// 1. 在特定文档内搜索
await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [{ key: "docId", match: { value: "doc_001" } }],
  },
  limit: 5,
});

// 2. 跨所有文档全局搜索
await client.search("document_chunks", {
  vector: queryVector,
  limit: 10,
});

// 3. 检索某个文档的所有 chunk（用于展示/引用）
await client.scroll("document_chunks", {
  filter: {
    must: [{ key: "docId", match: { value: "doc_001" } }],
  },
  order_by: "chunkIndex",
  limit: 200,
});

// 4. 在特定标题子树内搜索
await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [
      { key: "docId", match: { value: "doc_001" } },
      { key: "headingPath", match: { value: "Architecture Overview" } },
    ],
  },
  limit: 5,
});
```

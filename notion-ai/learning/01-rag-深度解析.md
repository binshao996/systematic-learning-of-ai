# RAG 深度解析 — 结构化学习笔记

## 1. Embedding 基础

### 什么是 Embedding Vector？

Embedding 是文本（或任何数据）在高维向量空间中的稠密数值表示。它通过将输入文本传入神经网络（通常是基于 Transformer 的编码器）来生成，该网络将语义映射到空间坐标。语义相似的句子在这个空间中会聚集在一起。

```
[Tokenization] -> [Transformer Encoder] -> [Mean Pooling / CLS token] -> [Dense Vector]
     "What is RAG?"              BERT model              768-dim float array
```

### 检索中的 Cosine Similarity

给定一个查询 embedding `q` 和一个文档 embedding `d`，相似度定义为：

```
cosine_similarity(q, d) = (q . d) / (||q|| * ||d||)
```

- 取值范围：理论上为 `[-1, 1]`，但对于文本 embedding 通常为 `[0, 1]`
- 只有**方向**起作用（模长被归一化消除）
- 预先将所有向量归一化为单位长度，则 dot product 等同于 cosine similarity

### Embedding 模型的权衡

| 因素 | 低维度 (384-512) | 高维度 (1024-4096) |
|---|---|---|
| 存储成本 | 低 | 高 |
| 检索速度 | 快 | 较慢 |
| 语义保真度 | 对简单任务足够 | 对细微/领域任务更好 |
| 示例 | `text-embedding-3-small` | `text-embedding-3-large` |

| 因素 | 单语模型 | 多语言模型 |
|---|---|---|
| 准确度 | 对单一语言更高 | 每种语言相对较低（容量分散） |
| 使用场景 | 仅英文应用 | 全球化产品 |
| 示例 | `BGE-base-en` | `DeepSeek-Embedding` |

### DeepSeek Embedding API

- **模型**: `deepseek-embedding`（有免费额度）
- **维度**: 1024（注意：小于 ada-002 的 1536）
- **最大 token 数**: 每个输入 4096
- **语言**: 强大的多语言支持（中文、英文等）
- **端点**: `POST https://api.deepseek.com/v1/embeddings`
- **输入格式**:

```json
{
  "model": "deepseek-embedding",
  "input": ["document text here"]
}
```

**响应**:

```json
{
  "data": [
    {
      "embedding": [0.012, -0.034, ...],
      "index": 0
    }
  ],
  "model": "deepseek-embedding",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

> **注意**: DeepSeek embedding 输出 1024 维。如果你的分块产生了非常短的片段，考虑将相关 chunk 拼接在一起或填充输入，以避免稀疏表示。

---

## 2. Chunking 策略

### 固定大小分块 (Fixed-Size Chunking)

将文本按固定数量的 token 分割，不考虑内容边界。

```typescript
function fixedSizeChunks(text: string, chunkSize: number, overlap: number): string[] {
  const tokens = tokenize(text);  // 或简单地按空格分割
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += chunkSize - overlap) {
    chunks.push(tokens.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}
```

| 优点 | 缺点 |
|---|---|
| 简单、可预测 | 可能将句子/段落从中切断 |
| 实现快速 | 无语义连贯性 |
| 确定性 | 对跨 chunk 概念检索效果差 |

**适用场景**: 快速原型、同质化文本（如日志条目）。

### 语义分块 (Semantic Chunking)

在自然边界上进行分割：段落、章节、标题。

```typescript
function semanticChunks(text: string, maxTokens: number): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current: string[] = [];

  for (const para of paragraphs) {
    if (tokenCount([...current, para].join("\n")) > maxTokens && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [para];
    } else {
      current.push(para);
    }
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}
```

| 优点 | 缺点 |
|---|---|
| 保留语义单元 | 可能产生不均匀的 chunk 大小 |
| 检索相关性更好 | 难以调整 max-token 限制 |
| chunk 可读性好 | 逻辑更复杂 |

**适用场景**: 结构良好的文档（文章、文档、书籍）。

### 递归分块 (Recursive Chunking)

按优先级尝试多种分隔符，递归地分割，直到 chunk 在目标大小范围内。

```
Priority: \n\n (double newline) > \n (newline) > . (sentence) > " " (word)
```

算法：
1. 尝试按 `\n\n` 分割。如果 chunk 仍然太大，选取最大的 chunk。
2. 按 `\n` 对该 chunk 进行分割。重复操作直至在目标范围内。
3. 依次回退到句子级分割，再到单词级分割。

LangChain 的 `RecursiveCharacterTextSplitter` 使用此策略。最佳的通用 chunker。

### 滑动窗口重叠 (Sliding Window Overlap)

重叠确保 chunk 边界处的信息不会丢失。

- **为什么需要**: 跨越两个 chunk 的句子如果从中被切断，将变得无法被检索到。
- **重叠量**: 通常为 chunk 大小的 10-20%。
  - 512-token chunk -> 50-100 token 重叠
  - 1024-token chunk -> 100-200 token 重叠
- **权衡**: 更多重叠 = 更多存储 + 检索更慢，但 recall 更高。

### Chunk 大小如何影响检索

| Chunk 大小 | Precision | Recall | 上下文质量 |
|---|---|---|---|
| 太小 (32-64) | 高（精确匹配） | 低（遗漏上下文） | 差（无周围信息） |
| 最优 (256-512) | 平衡 | 平衡 | 良好 |
| 太大 (1024+) | 低（结果中有噪声） | 高（大量匹配） | 差（干扰 LLM） |

通用规则：**使 chunk 大小与预期答案长度匹配**。对于段落的问答，256-512 token 效果良好。对于章节摘要，1024+ 可能合适。

### 元数据保留 (Metadata Preservation)

对于可追溯性和来源归属至关重要：

```typescript
interface Chunk {
  id: string;
  text: string;
  metadata: {
    source: string;          // 文件名 / URL
    heading: string;         // 最近的标题
    position: number;        // 在文档中的顺序
    start_char: number;      // 在原始文档中的字符偏移量
    chunk_size_tokens: number;
  };
  embedding: number[];
}
```

- **Heading**: 跟踪最近的章节标题，以便 LLM 能够引用来源。
- **Position**: 保留文档顺序，用于在 re-ranking 中打破平局。
- **Source**: 引用和调试所必需的。

---

## 3. 检索方法

### 稠密检索 — Dense Retrieval (Vector Similarity)

查询和文档被映射到同一向量空间中。搜索 = 通过 cosine similarity 寻找最近邻。

```
retrieve(query, docs, k=5):
  q_vec = embed(query)
  scores = [cosine_sim(q_vec, d.vec) for d in docs]
  top_k = docs.argsort(scores, descending)[:k]
  return top_k
```

- **优势**: 捕获语义相似性，同义词适用，能处理改写表述。
- **劣势**: 需要良好的 embedding，高维存储，新领域冷启动困难。

### 稀疏检索 — Sparse Retrieval (BM25 / 关键词)

BM25 是一种词袋排序函数，通过词频和逆文档频率对文档进行评分：

```
BM25(d, q) = sum over tokens t in q of IDF(t) * (TF(t,d) * (k1 + 1)) / (TF(t,d) + k1 * (1 - b + b * |d|/avgdl))
```

其中：
- `k1 = 1.2`（词频饱和参数）
- `b = 0.75`（长度归一化参数）
- `avgdl` = 语料库中文档的平均长度

| Dense | Sparse |
|---|---|
| 理解含义 | 精确匹配关键词 |
| 需要 GPU 做 embedding | 只需要倒排索引 |
| 在 1000 万+ 文档上慢（无 ANN） | 任意规模都快 |
| 对罕见术语失效 | 对罕见/技术术语表现出色 |

### 混合检索 (Hybrid Search)

使用加权求和结合稠密和稀疏评分：

```typescript
function hybridScore(denseScore: number, sparseScore: number, alpha: number): number {
  // 先将两者归一化到 [0, 1]（min-max 或排名归一化）
  return alpha * denseScore + (1 - alpha) * sparseScore;
}
```

- `alpha = 0.7`: 以稠密为主，适合语义搜索
- `alpha = 0.3`: 以关键词为主，适合技术/领域搜索
- `alpha = 0.5`: 平衡，通用场景

**排名融合**（Reciprocal Rank Fusion）是一种避免分数归一化的替代方案：

```
RRF(doc) = sum over rank r of 1 / (k + r)
```

其中 `k = 60`（常数）。结合排名列表而不关心原始分数。

### Re-ranking

在使用快速检索器检索 top-k（例如 20-50）个候选后，用一个较慢但更准确的 **cross-encoder reranker** 对其进行重新评分。

```
Fast retriever (cosine/BM25)  ->  top-50 candidates
Cross-encoder reranker         ->  top-5 final results
```

- **为什么**: Embedding 模型为每个文档只生成一个向量——它们丢失了细粒度的 query-doc 交互信息。Cross-encoder 联合处理 `(query, doc)` 对，能产生更好的相关性分数。
- **何时使用**: 只要延迟允许，始终使用。添加 reranker 是提升检索效果最有效的单项改进。
- **模型**: `BAAI/bge-reranker-v2-m3`、`Cohere rerank`、`DeepSeek-Reranker`。
- **成本**: 每个查询 O(k) 次 cross-encoder 调用。如果 `k=50`，即 50 次前向传播。

---

## 4. RAG Pipeline 模式

### 朴素 RAG (Naive RAG)

最简单的形式：检索，然后增强，然后生成。

```
User Query
    |
    v
[Embedding] -> [Vector Search] -> top-k chunks
    |
    v
[Prompt Assembly]: System prompt + "Context:\n" + chunks + "\nQuery:\n" + query
    |
    v
[LLM Generate] -> Answer
```

**局限性**:
- 没有查询理解或改写
- Retriever 只有一次机会——没有反馈循环
- 上下文窗口可能被不相关的 chunk 撑满
- 没有优雅处理缺失信息的机制

### 高级 RAG: 查询转换 (Query Transformation)

在检索之前改进查询：

```typescript
// 查询改写: LLM 改写用户模糊的查询
const rewrittenQuery = await llm.complete(
  `Given the question, rewrite it to be more specific and searchable:\nQuestion: ${query}`
);

// 查询扩展: 生成多个搜索查询
const queries = await llm.complete(
  `Generate 3 different search queries for:\n${query}`
);

// HyDE: 先生成假设性答案，然后使用该答案进行检索
const hypotheticalDoc = await llm.complete(`Answer: ${query}`);
const hydeEmbedding = await embed(hypotheticalDoc);
```

### 多步检索 (Multi-Step Retrieval)

**迭代检索**: 检索 -> 生成部分答案 -> 识别缺口 -> 再次检索。

```
[Query] -> [Retrieve] -> [Generate partial] 
    ^                           |
    |--- [Identify gaps] -------|
```

**Self-RAG**: LLM 在生成答案之前反思检索到的 chunk 是否相关。

### 上下文窗口优化

| 策略 | 描述 |
|---|---|
| **滑动窗口** | 保留最近 k 个 chunk，丢弃更早的 |
| **相关性过滤** | 对每个 chunk 评分，丢弃低于阈值者 |
| **压缩** | 要求 LLM 对检索到的 chunk 进行摘要 |
| **结构化提取** | 仅提取相关事实，省略填充内容 |
| **Lost-in-the-Middle** | 将最相关的 chunk 放在上下文的**开头** |

**Lost-in-the-Middle** 论文（Liu et al., 2023）表明，LLM 强烈偏好上下文窗口开头和结尾处的信息。**始终**按相关性降序排列检索到的 chunk。

```typescript
// 错误: 按时间顺序排列
context = chunks.map(c => c.text).join("\n");

// 正确: 按相关性优先排列
context = chunks.sort((a, b) => b.relevance - a.relevance)
  .map(c => c.text).join("\n");
```

### 引用策略 (Citation Strategies)

用于答案的可追溯性——在生产环境 RAG 中至关重要：

```typescript
// 为每个 chunk 分配 ID，并要求 LLM 引用它们
const context = chunks.map((c, i) => `[${i}] ${c.text}`).join("\n\n");

const prompt = `
Answer the question using the context below.
Cite sources using [0], [1], etc. at the end of each sentence.

Context:
${context}

Question: ${query}
Answer:`;

// 预期输出:
// "RAG stands for Retrieval-Augmented Generation [1]. It was introduced in 2020 [0]."
```

**方法**:
| 方法 | 如何做 | 权衡 |
|---|---|---|
| 来源标签 | 在生成的文本中使用 `[Doc:3]` | 简单但 LLM 可能幻觉出编号 |
| 包含检查 | LLM 答案 token -> 检查哪个 chunk 包含它 | 事后检查，不能防止幻觉 |
| 句子级 | LLM 逐句回答，附上引用 | 慢但精确 |

---

## 5. RAG 实验: 关键要点

参见 `rag-experiment.ts` 获取可运行的端到端示例。

核心洞察：**RAG 的质量取决于其最薄弱的环节**。糟糕的 chunker 会破坏检索，糟糕的 retriever 会给 LLM 提供糟糕的上下文，糟糕的 prompt 则会浪费好的上下文。三者需协调调整，从人工检查检索到的 chunk 开始，然后再加入 LLM 步骤。

---

## 6. Notion AI 项目中的 RAG 实际实现

以上是 RAG 的理论基础。下面详细说明 Notion AI 项目中 RAG 的具体技术栈、实现流程和代码细节。

### 6.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| Embedding 模型 | Jina embeddings v3 (`jina-embeddings-v3`) | 1024 维向量，支持中英文，10 秒超时 |
| 向量数据库 | Qdrant（自托管 Docker） | Cosine 距离，Payload 过滤，关键字索引 |
| Chat 模型 | DeepSeek Chat (`deepseek-chat`) | 64K 上下文，temperature=0.3，SSE 流式 |
| 元数据存储 | PostgreSQL + pgvector | 存储 chunk 原文、headingPath、qdrantPointId |

**为什么用 Jina 而非 DeepSeek Embedding？**
- Jina embeddings v3 支持 1024 维输出（可配置），质量优于 DeepSeek embedding
- 支持 task 参数（`retrieval.passage` / `retrieval.query`），区分文档和查询场景
- 通过环境变量 `EMBEDDING_API_URL` 和 `EMBEDDING_MODEL` 可灵活切换

### 6.2 完整摄入流程：从上传到可检索

```
用户上传文件（PDF/DOCX/MD/TXT）
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 1: 解析 (parseFile)                                     │
│  ───────────────────────────────────                          │
│  parser.ts: 根据扩展名路由到对应解析器                           │
│  ├─ .pdf  → pdf-parse 提取文本                                │
│  ├─ .docx → mammoth 提取文本 + 标题层级                        │
│  ├─ .md   → TextDecoder + 正则提取 `#` 标题                    │
│  └─ .txt  → TextDecoder 直接读取                               │
│                                                               │
│  输出: { text: "全文...", sections: [...], metadata: {...} }   │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 2: 切分 (chunkDocument, strategy="semantic")            │
│  ──────────────────────────────────────────                   │
│  chunker.ts: 默认使用语义切分                                  │
│                                                               │
│  SemanticChunker 算法:                                        │
│  1. 按 `#` 标题标记将全文 split 为 sections                    │
│  2. 扫描每个 section 内的所有 `#` 标题，维护 headingPath 层级   │
│     e.g. ["第一章", "1.1 概述"]                                │
│  3. 长 section (>1000字符) 按 `\n\n+` 拆分为段落级 chunk       │
│  4. 短 section 作为单个 chunk                                  │
│                                                               │
│  另两种策略:                                                   │
│  ├─ FixedSizeChunker: 定长 500 字符 + 50 字符 overlap          │
│  └─ RecursiveChunker: 递归分隔符回退（\n\n → \n → . → 空格）   │
│                                                               │
│  每个 Chunk 结构:                                              │
│  { text, chunkIndex, headingPath: string[],                   │
│    charStart, charEnd }                                       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 3: 向量化 + 入库 (indexChunks, batchSize=20)            │
│  ──────────────────────────────────────────────               │
│  indexer.ts:                                                  │
│                                                               │
│  for each batch of 20 chunks:                                │
│    1. deepseekEmbed(batch.map(c => c.text))                  │
│       → POST jina.ai/v1/embeddings                           │
│       → 返回 1024-dim 向量数组                                 │
│                                                               │
│    2. 写入 PostgreSQL chunks 表（元数据）                       │
│       INSERT INTO chunks (docId, chunkIndex, text,            │
│         headingPath) RETURNING id                            │
│                                                               │
│    3. 写入 Qdrant（向量 + Payload）                            │
│       upsertChunks([{ id: row.id, vector: [...],             │
│         payload: { docId, chunkIndex, text,                  │
│           headingPath, charStart, charEnd }}])               │
│                                                               │
│    4. 回写 qdrantPointId 到 PostgreSQL                        │
│       UPDATE chunks SET qdrantPointId = ? WHERE id = ?       │
│                                                               │
│  注意: 每次索引前先删除该文档的旧 chunks（deleteDocChunks），   │
│  实现"覆盖式重索引"                                            │
└──────────────────────────────────────────────────────────────┘
```

**为什么要双写（PostgreSQL + Qdrant）？**
- Qdrant 负责向量检索（ANN 搜索），PostgreSQL 负责结构化查询和关联
- chunk 的 `qdrantPointId` 存在 Postgres 中，可通过文档 ID 快速定位向量
- 即使 Qdrant 数据丢失，可从 PostgreSQL 重建索引

### 6.3 RAG 查询流程

```
用户提问（如 "什么是 RAG？"）
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 1: 查询向量化                                           │
│  retriever.ts:                                               │
│  queryVector = deepseekEmbed([query])[0]  // 1024-dim        │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 2: Qdrant 向量搜索                                      │
│  qdrant.ts → searchChunks(queryVector, { limit: 5, filter }) │
│                                                               │
│  支持两种模式:                                                 │
│  ├─ 全库搜索: 不带 filter，搜索所有已索引文档                    │
│  └─ 文档内搜索: filter: { docId: "xxx" }，限定在指定文档内      │
│                                                               │
│  返回: [{ id, score, payload: { docId, text, headingPath } }]│
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 3: 上下文组装 + 生成 (generator.ts)                      │
│                                                               │
│  构建 context:                                                │
│  [chunk:uuid1]                                                │
│  Source: docTitle                                             │
│  Section: headingPath.join(" > ")                             │
│  chunk text content                                           │
│                                                               │
│  [chunk:uuid2]                                                │
│  Source: docTitle2                                            │
│  ...                                                          │
│                                                               │
│  系统 Prompt (lib/prompts.ts):                                │
│  "You are an AI assistant for a knowledge base.              │
│   Answer based on the provided context chunks.               │
│   Cite sources using [chunk:CHUNK_ID] format.                │
│   If context doesn't contain the answer, say so."            │
│                                                               │
│  调用: deepseekChat(messages, { stream: true, temperature:0.3 })│
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Step 4: 流式返回 (透传 DeepSeek SSE)                          │
│  chat.ts 路由直接将 DeepSeek 的 SSE 响应流转发给前端            │
│  Content-Type: text/event-stream                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.4 检索降级策略

```typescript
// engine.ts: ragQuery() 的容错逻辑
export async function ragQuery(query: string, options?: { docId?: string }) {
  try {
    const chunks = await retrieve(query, options);  // Step 1-2
    if (chunks.length > 0) {
      return generateStream(query, chunks);          // Step 3-4 (RAG)
    }
  } catch (err) {
    console.warn("Retrieval failed, falling back to direct chat:", ...);
  }
  // 降级: 直接对话，不使用 RAG 上下文
  return deepseekChat([
    { role: "system", content: "You are a helpful AI assistant..." },
    { role: "user", content: query },
  ], { stream: true, temperature: 0.3 });
}
```

**降级触发条件：**
- Qdrant 服务不可用 → 捕获异常，直接对话
- 检索结果为空 → chunks.length === 0，直接对话
- 文档无已索引内容 → 同上

### 6.5 引用提取

```typescript
// citation.ts: 从 AI 响应中提取 [chunk:UUID] 标记
function extractCitations(response: string, chunks: Chunk[]): Citation[] {
  const regex = /\[chunk:([a-f0-9-]+)\]/gi;
  // 遍历匹配 → 在 chunks 中查找对应 chunkId → 返回引用列表
}
```

前端收到引用后，渲染为可点击的蓝色链接（`citation-link.tsx`），点击跳转到对应文档。

### 6.6 写作动作 vs RAG 问答的路由区分

```typescript
// chat.ts 路由中的分流逻辑
const WRITING_ACTIONS = ["continue", "rewrite", "translate-zh",
  "translate-en", "summarize", "improve", "longer", "shorter", "tone"];

function isWritingAction(message: string): boolean {
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? WRITING_ACTIONS.includes(match[1]) : false;
}

// 写作动作 → 直接对话（跳过 RAG，不需要引用标记）
// 普通消息 → ragQuery()（走完整 RAG 流程）
```

**为什么写作动作要跳过 RAG？**
- 写作动作（改进、重写、翻译等）不需要知识库检索
- 避免 RAG 系统 prompt 中的 `[chunk:xxx]` 引用标记污染写作输出
- 减少不必要的 embedding API 调用，节省延迟和成本

### 6.7 关键设计决策总结

| 决策 | 选择 | 原因 |
|------|------|------|
| Embedding 模型 | Jina embeddings v3 | 1024 维可配，中英文质量好，支持 task 参数 |
| 默认切分策略 | Semantic（语义切分） | 保留标题层级，chunk 语义完整 |
| 批处理大小 | 20 个 chunk/批 | 平衡 API 延迟和请求次数 |
| 检索 Top-K | 5 | 足够覆盖大多数问题，不超出上下文预算 |
| 双写策略 | PostgreSQL + Qdrant | PG 做结构化查询，Qdrant 做向量检索 |
| 覆盖式重索引 | 先删后写 | 避免重复数据，简化更新逻辑 |
| 降级策略 | 检索失败 → 直接对话 | 保证可用性，不因 RAG 组件故障而拒绝服务 |

---

### 参考文献

- Lewis et al., 2020 — "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
- Liu et al., 2023 — "Lost in the Middle: How Language Models Use Long Contexts"
- DeepSeek API 文档: https://api-docs.deepseek.com/
- BM25: Robertson & Zaragoza, 2009 — "The Probabilistic Relevance Framework"

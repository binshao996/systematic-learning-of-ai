# DeepSeek API 精通 — 结构化学习笔记

## 1. Chat Completion API

### 端点

```
POST https://api.deepseek.com/v1/chat/completions
```

### Message 结构

API 接受一个消息对象数组，每个对象包含 `role` 和 `content`：

| Role | 用途 | 典型内容 |
|---|---|---|
| `system` | 设定助手行为、角色、约束 | 指令、格式规则、护栏 |
| `user` | 最终用户查询或输入 | 实际问题或 prompt |
| `assistant` | 模型响应（用于多轮对话历史） | 模型之前返回的回复 |

```
Messages 流转:
  system (一次) -> user (1..n) -> assistant (1..n) -> user (当前)
```

### 请求格式

```typescript
// @/learning/lib/deepseek.ts

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;   // 默认值: 1.0, 范围: [0, 2]
  top_p?: number;         // 默认值: 1.0, nucleus sampling
  max_tokens?: number;    // 响应中的最大 token 数
  stream?: boolean;       // 默认值: false
}

async function chatCompletion(params: {
  apiKey: string;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}): Promise<Response> {
  const { apiKey, messages, model = "deepseek-chat", temperature = 0.7, max_tokens = 2048, stream = false } = params;

  return fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream,
    }),
  });
}
```

### 参数深入解析

| 参数 | 作用 | 建议 |
|---|---|---|
| `temperature` | 创造性/随机性。0 = 确定性，2 = 最大多样性 | 代码/分类用 0.3，创意写作用 0.7 |
| `top_p` | Nucleus sampling: 仅考虑累积概率 `<= top_p` 的 token | 保持 1.0，除非需要微调；作为 temperature 的替代方案 |
| `max_tokens` | 输出长度的硬性上限（按 token 计，非字符） | 设置一个合理的上限；实际输出可能因 EOS 而提前结束 |
| `stream` | 若为 true，响应为 SSE 流而非单个 JSON | 聊天 UX 始终使用 true；批处理/离线用 false |

> 注意: DeepSeek 建议不要同时修改 `temperature` 和 `top_p`。选择其中一个旋钮即可。

### 流式传输 — SSE 解析模式

当 `stream: true` 时，服务器发送一个 Server-Sent Events 流。每个事件行如下所示：

```
data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}

data: [DONE]
```

完整的流式消费端：

```typescript
async function streamChat(params: {
  apiKey: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}) {
  const { apiKey, messages, onToken, onDone, onError, signal } = params;

  const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    onError(new Error(`HTTP ${response.status}: ${await response.text()}`));
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // 将不完整的行保留在 buffer 中

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6); // 去除 "data: " 前缀
        if (payload === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) onToken(content);
        } catch {
          // 格式异常的 SSE 行 — 跳过
        }
      }
    }
    onDone();
  } catch (err) {
    if (signal?.aborted) {
      onDone(); // 有意的取消，不是错误
    } else {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    reader.releaseLock();
  }
}
```

### 响应格式 — 非流式

```typescript
// 非流式响应格式
interface ChatCompletionResponse {
  id: string;                         // 例如 "chatcmpl-xxx"
  object: "chat.completion";
  created: number;                    // Unix 时间戳
  model: string;                      // 例如 "deepseek-chat"
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
      refusal: string | null;         // 内容过滤器拒绝
    };
    finish_reason: "stop" | "length" | "content_filter" | "tool_calls";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

关键字段:
- `choices[0].message.content` — 实际回复
- `usage.total_tokens` — 计费的 token 数
- `finish_reason: "length"` 意味着响应达到了 `max_tokens` 限制（输出被截断）

### 流式响应 — 累加器模式

从流中重建完整消息（例如用于日志记录）：

```typescript
async function streamAndAccumulate(params: {
  apiKey: string;
  messages: ChatMessage[];
}): Promise<string> {
  const parts: string[] = [];

  await streamChat({
    ...params,
    onToken: (token) => parts.push(token),
    onDone: () => {},
    onError: (err) => { throw err; },
  });

  return parts.join("");
}
```

---

## 2. Embedding API

### 端点

```
POST https://api.deepseek.com/v1/embeddings
```

### 请求

```typescript
interface EmbeddingRequest {
  model: string;
  input: string | string[];  // 单个字符串或字符串数组
}

interface EmbeddingResponse {
  object: "list";
  data: {
    object: "embedding";
    index: number;
    embedding: number[];      // float 数组，维度取决于模型
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
```

### 使用

```typescript
async function getEmbedding(params: {
  apiKey: string;
  input: string | string[];
  model?: string;
}): Promise<EmbeddingResponse["data"]> {
  const { apiKey, input, model = "deepseek-embed" } = params;

  const response = await fetch(`${DEEPSEEK_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data: EmbeddingResponse = await response.json();
  return data.data;
}
```

### 批量 Embedding

在单个请求中发送多个文本——比逐个发送更高效：

```typescript
const texts = [
  "Retrieval-Augmented Generation combines retrieval with generation.",
  "DeepSeek supports both chat and embedding models.",
  "Cosine similarity measures semantic closeness.",
];

const embeddings = await getEmbedding({ apiKey, input: texts });
// embeddings.length === 3
// embeddings[0].embedding -> float array
// embeddings[0].index -> 0
```

### 维度信息

| 模型 | 维度 | 备注 |
|---|---|---|
| `deepseek-embed` | 1024 | 通用 embedding |
| `deepseek-embed-v2` | 2048 | 更高保真度，更昂贵 |

- 大多数 RAG pipeline 使用 1024-dim 即可；仅当检索 recall 不足时切换到 2048。
- 在存储或比较之前将 embedding 归一化为单位长度。

```typescript
function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}
```

---

## 3. 结构化输出 (JSON Mode)

DeepSeek 支持 JSON mode，强制模型输出有效的 JSON。

### 请求

```typescript
async function chatJSON<T>(params: {
  apiKey: string;
  messages: ChatMessage[];
  schema: string;         // 期望的 JSON 格式描述
}): Promise<T> {
  const systemMessage: ChatMessage = {
    role: "system",
    content: `You are a JSON-only assistant. Always respond with valid JSON matching this schema: ${params.schema}. Do not include markdown fences, explanations, or any text outside the JSON object.`,
  };

  const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [systemMessage, ...params.messages],
      response_format: { type: "json_object" },
      temperature: 0.1, // 低 temperature 以获得可靠的 JSON 输出
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status}`);
  }

  const data: ChatCompletionResponse = await response.json();
  const raw = data.choices[0].message.content;

  // 解析并验证
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `Model returned invalid JSON.\nRaw content:\n${raw}\n` +
      `Usage: ${JSON.stringify(data.usage)}`
    );
  }
}
```

### 使用示例

```typescript
const result = await chatJSON<{
  title: string;
  priority: "low" | "medium" | "high";
  dueDate: string;
  tags: string[];
}>({
  apiKey,
  messages: [
    { role: "user", content: "Review Q2 financial report by Friday, it's urgent" },
  ],
  schema: `{ title: string, priority: "low"|"medium"|"high", dueDate: string (ISO date), tags: string[] }`,
});

// result.title   -> "Review Q2 financial report"
// result.priority -> "high"
```

### JSON Mode 的关键规则

1. **System prompt 必须要求仅输出 JSON。** `response_format` 约束是一个强烈提示，不是保证——模型仍然可能输出 markdown 代码块标记或额外文本。
2. **始终将 parse 包裹在 try/catch 中。** 永远不要假设输出是有效的 JSON。
3. **在 system prompt 中包含 schema。** 模型需要知道期望的输出格式。
4. **设置低 temperature (0.0--0.2)。** 较高的 temperature 会增加 JSON 格式错误的机会。
5. **在 JSON mode 下优先使用 `temperature` 而非 `top_p`。** 对于结构化输出，temperature 更可预测。

### 处理拒绝 (Refusals)

```typescript
const refusal = data.choices[0].message.refusal;
if (refusal) {
  throw new Error(`Content filter refused: ${refusal}`);
}
```

---

## 4. 错误处理与重试

### 错误分类

| HTTP 状态码 | 含义 | 恢复策略 |
|---|---|---|
| 400 | 错误请求（无效参数） | 修复请求，不要重试 |
| 401 | API key 无效 | 修复凭证，不要重试 |
| 429 | 频率限制 | 使用指数退避重试 |
| 500 | 服务器错误 | 使用退避重试（可能是临时错误） |
| 503 | 服务过载 | 使用退避重试 |
| timeout | 网络/读取超时 | 使用退避重试 |

### 带指数退避的重试包装器

```typescript
interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;       // 第一次重试前的初始延迟
  maxDelayMs?: number;         // 延迟上限
  jitter?: boolean;            // 添加随机抖动以避免惊群效应
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitter: true,
};

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === config.maxRetries) break;

      // 判断是否适合重试
      if (err instanceof TypeError && err.message.includes("fetch")) {
        // 网络错误 — 重试
      } else if (err instanceof ResponseError) {
        const status = err.status;
        if (status === 429 || status >= 500) {
          // 频率限制或服务器错误 — 重试
        } else if (status === 400 || status === 401) {
          // 客户端错误 — 不重试
          throw err;
        }
      }

      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError;
}

function calculateDelay(attempt: number, config: Required<RetryOptions>): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);

  if (!config.jitter) return capped;

  // Full jitter: 在 0 到 capped 之间随机取值
  return Math.random() * capped;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 用于分类带 HTTP 状态码错误的辅助类
class ResponseError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = "ResponseError";
  }
}

async function fetchWithError(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ResponseError(
      `HTTP ${response.status}: ${body.slice(0, 200)}`,
      response.status,
      body,
    );
  }

  return response;
}
```

### 频率限制 — 429 处理

```typescript
// DeepSeek 在 429 响应中发送 Retry-After 头
async function handleRateLimit(error: ResponseError): Promise<void> {
  if (error.status !== 429) return;

  // 首先尝试使用 Retry-After 头
  const retryAfter = error.body
    ?.match(/"retry_after"?\s*:\s*(\d+\.?\d*)/)?.[1];

  const waitMs = retryAfter
    ? parseFloat(retryAfter) * 1000 + 100  // 小缓冲
    : 5000;                                 // 默认 5 秒

  await sleep(waitMs);
}
```

### 超时处理

```typescript
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

### Token 预算溢出

```typescript
function checkTokenBudget(params: {
  systemPrompt: string;
  context: string[];
  history: string[];
  query: string;
  maxTokens: number;      // 例如 64000
  responseTokens: number; // 为响应预留的 token 数
}): { ok: boolean; estimatedTokens: number; available: number } {
  const estimateTokens = (text: string) => Math.ceil(text.length / 3.5); // 粗略估计

  const total =
    estimateTokens(params.systemPrompt) +
    params.context.reduce((sum, c) => sum + estimateTokens(c), 0) +
    params.history.reduce((sum, h) => sum + estimateTokens(h), 0) +
    estimateTokens(params.query);

  const available = params.maxTokens - params.responseTokens;

  return {
    ok: total <= available,
    estimatedTokens: total,
    available,
  };
}
```

### 异常响应处理

```typescript
function safeParseJSON<T>(raw: string): {
  data: T | null;
  error: string | null;
  partial: Record<string, unknown> | null;
} {
  // 1. 尝试直接解析
  try {
    return { data: JSON.parse(raw) as T, error: null, partial: null };
  } catch {
    // 2. 尝试从 markdown 代码块中提取 JSON
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return { data: JSON.parse(fenceMatch[1]) as T, error: null, partial: null };
      } catch {
        // 继续尝试
      }
    }

    // 3. 尝试通过正则表达式查找 {...} 或 [...]
    const objectMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objectMatch) {
      try {
        return { data: JSON.parse(objectMatch[1]) as T, error: null, partial: null };
      } catch {
        // 尽力解析
        try {
          const partial = JSON.parse(objectMatch[1]) as Record<string, unknown>;
          return { data: null, error: "Partial parse succeeded", partial };
        } catch {
          // 继续尝试
        }
      }
    }

    return { data: null, error: `Invalid JSON: ${raw.slice(0, 200)}`, partial: null };
  }
}
```

---

## 5. Token 计数与上下文管理

### Token 估算（经验法则）

| 语言 | 每个 token 对应的字符数 | 示例 |
|---|---|---|
| 英文 | ~每 3.5--4 个字符一个 token | "Hello world" ≈ 2--3 tokens |
| 中文 | ~每 1.5--2 个字符一个 token | "你好世界" ≈ 2--4 tokens |
| 代码 | ~每 3 个字符一个 token | `const x = 1;` ≈ 4 tokens |
| 混合 | 使用 3.5 chars/token 作为基线 | 安全的默认值 |

```typescript
// 无需 tokenizer 的快速估算
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// 对 CJK 占比较高的文本更精确
function estimateTokensAccurate(text: string): number {
  // CJK 字符 (CJK Unified Ideographs)
  const cjkRegex = /[一-鿿㐀-䶿豈-﫿]/g;
  const cjkCount = (text.match(cjkRegex) || []).length;
  const latinCount = text.length - cjkCount;

  return Math.ceil(cjkCount / 1.5) + Math.ceil(latinCount / 4);
}
```

### DeepSeek 上下文窗口

| 模型 | 上下文窗口 | 实际可用 |
|---|---|---|
| `deepseek-chat` | 64K tokens | ~60K（留出缓冲） |

64K 窗口意味着 (system + history + context + query + response) 的总长度必须适应其中。对于 RAG 工作流，必须主动管理此预算。

### RAG 的预算管理

```
┌─────────────────────────────────────────────────────────┐
│                  64K Token Budget                        │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  System  │  Context  │ History  │  Query   │  Response   │
│  ~2K     │  ~30K    │  ~10K    │  ~2K     │  ~4K        │
│          │  (docs)  │  (turns) │          │  (reserved) │
└──────────┴──────────┴──────────┴──────────┴─────────────┘
                           │
                   47K used + 4K reserved = 51K
                   Remaining for context expansion: 13K
```

```typescript
interface RAGBudget {
  systemPrompt: string;
  retrievedDocs: string[]; // 已分块的文档
  conversationHistory: string[]; // 之前的问答轮次
  userQuery: string;
  reservedResponseTokens: number; // 为答案预留的 token 数
}

function allocateBudget(params: RAGBudget): {
  ok: boolean;
  usedTokens: number;
  remaining: number;
  truncated: boolean;
} {
  const MAX_TOKENS = 64000;
  const { systemPrompt, retrievedDocs, conversationHistory, userQuery, reservedResponseTokens } = params;

  const estimate = (s: string) => Math.ceil(s.length / 3.5);

  const systemTokens = estimate(systemPrompt);
  const queryTokens = estimate(userQuery);
  const reserved = reservedResponseTokens;

  const availableForDocs = MAX_TOKENS - systemTokens - queryTokens - reserved;

  // 首先分配 history（它有固定的预算）
  const historyBudget = 10000; // ~10K tokens 用于 history
  let historyTokens = 0;
  const historyUsed: string[] = [];

  for (const turn of conversationHistory) {
    const turnTokens = estimate(turn);
    if (historyTokens + turnTokens > historyBudget) break;
    historyTokens += turnTokens;
    historyUsed.push(turn);
  }

  // 剩余预算分配给检索到的文档
  const docBudget = availableForDocs - historyTokens;
  let docTokens = 0;
  const docsUsed: string[] = [];
  let truncated = false;

  for (const doc of retrievedDocs) {
    const docTokenCount = estimate(doc);
    if (docTokens + docTokenCount > docBudget) {
      truncated = true;
      break;
    }
    docTokens += docTokenCount;
    docsUsed.push(doc);
  }

  const usedTokens = systemTokens + docTokens + historyTokens + queryTokens;
  const remaining = MAX_TOKENS - usedTokens;

  return { ok: remaining >= 0, usedTokens, remaining, truncated };
}

// 使用
const budget = allocateBudget({
  systemPrompt: "You are a helpful assistant...",
  retrievedDocs: chunkedDocuments,
  conversationHistory: previousTurns,
  userQuery: "What is RAG?",
  reservedResponseTokens: 4096,
});

if (!budget.ok) {
  console.warn(
    `Token budget exceeded. Used: ${budget.usedTokens}, ` +
    `Remaining: ${budget.remaining}. Truncated: ${budget.truncated}`
  );
}
```

### 动态压缩策略

当预算紧张时，按顺序应用压缩：

```
1. 首先截断最旧的对话历史  (价值最低)
2. 截断与查询最远的检索文档 (相关性最低)
3. 缩短 system prompt (移除详细示例)
4. 缩短用户查询 (最后手段)
```

```typescript
function compressToFit(
  docs: Array<{ content: string; score: number }>,
  maxTokens: number,
): string[] {
  // 按相关性排序（最高的在前），保留能容纳的部分
  const sorted = [...docs].sort((a, b) => b.score - a.score);
  const result: string[] = [];
  let totalTokens = 0;

  for (const doc of sorted) {
    const tokens = estimateTokens(doc.content);
    if (totalTokens + tokens > maxTokens) break;
    totalTokens += tokens;
    result.push(doc.content);
  }

  return result;
}
```

---

## 快速参考

```typescript
// DeepSeek SDK 等价表示（概念层面）
const api = {
  base:  "https://api.deepseek.com/v1",
  chat:  "/chat/completions",
  embed: "/embeddings",
  models: {
    chat: "deepseek-chat",    // 64K 上下文
    embed: "deepseek-embed",  // 1024维
  },
};
```

| 任务 | 端点 | 方法 |
|---|---|---|
| Chat (非流式) | `POST /v1/chat/completions` | `stream: false` |
| Chat (流式) | `POST /v1/chat/completions` | `stream: true` |
| Embedding | `POST /v1/embeddings` | — |
| JSON 输出 | `POST /v1/chat/completions` | `response_format: { type: "json_object" }` |

# DeepSeek API Mastery — Structured Learning Notes

## 1. Chat Completion API

### Endpoint

```
POST https://api.deepseek.com/v1/chat/completions
```

### Message Structure

The API accepts an array of message objects, each with a `role` and `content`:

| Role | Purpose | Typical Content |
|---|---|---|
| `system` | Set assistant behavior, persona, constraints | Instructions, formatting rules, guardrails |
| `user` | End-user query or input | The actual question or prompt |
| `assistant` | Model response (used for multi-turn history) | Previous replies from the model |

```
Messages flow:
  system (once) -> user (1..n) -> assistant (1..n) -> user (current)
```

### Request Shape

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
  temperature?: number;   // default: 1.0, range: [0, 2]
  top_p?: number;         // default: 1.0, nucleus sampling
  max_tokens?: number;    // max tokens in the response
  stream?: boolean;       // default: false
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

### Parameters Deep Dive

| Parameter | Effect | Recommendation |
|---|---|---|
| `temperature` | Creativity / randomness. 0 = deterministic, 2 = maximum diversity | 0.3 for code/classification, 0.7 for creative writing |
| `top_p` | Nucleus sampling: only consider tokens with cumulative probability `<= top_p` | Keep at 1.0 unless tuning; alternative to temperature |
| `max_tokens` | Hard cutoff on output length (in tokens, not characters) | Set to a reasonable cap; actual output may stop earlier via EOS |
| `stream` | If true, response is SSE stream instead of single JSON | Always true for chat UX; false for batch/offline |

> Note: DeepSeek recommends NOT modifying both `temperature` and `top_p` simultaneously. Pick one knob.

### Streaming — SSE Parsing Pattern

When `stream: true`, the server sends a Server-Sent Events stream. Each event line looks like:

```
data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}

data: [DONE]
```

Full streaming consumer:

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
      buffer = lines.pop() ?? ""; // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice(6); // strip "data: " prefix
        if (payload === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content ?? "";
          if (content) onToken(content);
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
    onDone();
  } catch (err) {
    if (signal?.aborted) {
      onDone(); // intentional cancellation, not an error
    } else {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    reader.releaseLock();
  }
}
```

### Response Format — Non-Streaming

```typescript
// Non-streaming response shape
interface ChatCompletionResponse {
  id: string;                         // e.g. "chatcmpl-xxx"
  object: "chat.completion";
  created: number;                    // Unix timestamp
  model: string;                      // e.g. "deepseek-chat"
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
      refusal: string | null;         // content filter refusal
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

Key fields:
- `choices[0].message.content` — the actual reply
- `usage.total_tokens` — billable token count
- `finish_reason: "length"` means the response hit `max_tokens` (the output was truncated)

### Streaming Response — Accumulator Pattern

To reconstruct the full message from a stream (e.g. for logging):

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

### Endpoint

```
POST https://api.deepseek.com/v1/embeddings
```

### Request

```typescript
interface EmbeddingRequest {
  model: string;
  input: string | string[];  // single string or array of strings
}

interface EmbeddingResponse {
  object: "list";
  data: {
    object: "embedding";
    index: number;
    embedding: number[];      // float array, dimension depends on model
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
```

### Usage

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

### Batch Embedding

Send multiple texts in a single request — more efficient than one-at-a-time:

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

### Dimension Info

| Model | Dimensions | Notes |
|---|---|---|
| `deepseek-embed` | 1024 | General-purpose embedding |
| `deepseek-embed-v2` | 2048 | Higher fidelity, more expensive |

- Use 1024-dim for most RAG pipelines; switch to 2048 only when retrieval recall is insufficient.
- Normalize embeddings to unit length before storing or comparing.

```typescript
function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}
```

---

## 3. Structured Output (JSON Mode)

DeepSeek supports JSON mode, which forces the model to output valid JSON.

### Request

```typescript
async function chatJSON<T>(params: {
  apiKey: string;
  messages: ChatMessage[];
  schema: string;         // description of the expected JSON shape
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
      temperature: 0.1, // low temperature for reliable JSON
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status}`);
  }

  const data: ChatCompletionResponse = await response.json();
  const raw = data.choices[0].message.content;

  // Parse and validate
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

### Usage Example

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

### Critical Rules for JSON Mode

1. **System prompt MUST demand JSON-only output.** The `response_format` constraint is a strong hint, not a guarantee — the model can still produce markdown fences or stray text.
2. **Always wrap parse in try/catch.** Never assume the output is valid JSON.
3. **Include the schema in the system prompt.** The model needs to know the expected shape.
4. **Set low temperature (0.0--0.2).** Higher temperatures increase the chance of malformed JSON.
5. **Prefer `temperature` over `top_p` for JSON mode.** Temperature is more predictable for structured output.

### Handling Refusals

```typescript
const refusal = data.choices[0].message.refusal;
if (refusal) {
  throw new Error(`Content filter refused: ${refusal}`);
}
```

---

## 4. Error Handling & Retry

### Error Categories

| HTTP Status | Meaning | Recovery Strategy |
|---|---|---|
| 400 | Bad request (invalid params) | Fix request, do not retry |
| 401 | Invalid API key | Fix credentials, do not retry |
| 429 | Rate limited | Retry with exponential backoff |
| 500 | Server error | Retry with backoff (may be transient) |
| 503 | Service overloaded | Retry with backoff |
| timeout | Network/read timeout | Retry with backoff |

### Retry Wrapper with Exponential Backoff

```typescript
interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;       // initial delay before first retry
  maxDelayMs?: number;         // cap on delay
  jitter?: boolean;            // add random jitter to avoid thundering herd
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

      // Determine if retry is appropriate
      if (err instanceof TypeError && err.message.includes("fetch")) {
        // Network error — retry
      } else if (err instanceof ResponseError) {
        const status = err.status;
        if (status === 429 || status >= 500) {
          // Rate limit or server error — retry
        } else if (status === 400 || status === 401) {
          // Client error — do not retry
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

  // Full jitter: random between 0 and capped
  return Math.random() * capped;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Helper to classify errors with HTTP status
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

### Rate Limiting — 429 Handling

```typescript
// DeepSeek sends Retry-After header on 429
async function handleRateLimit(error: ResponseError): Promise<void> {
  if (error.status !== 429) return;

  // Try Retry-After header first
  const retryAfter = error.body
    ?.match(/"retry_after"?\s*:\s*(\d+\.?\d*)/)?.[1];

  const waitMs = retryAfter
    ? parseFloat(retryAfter) * 1000 + 100  // small buffer
    : 5000;                                 // default 5s

  await sleep(waitMs);
}
```

### Timeout Handling

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

### Token Limit Exceeded

```typescript
function checkTokenBudget(params: {
  systemPrompt: string;
  context: string[];
  history: string[];
  query: string;
  maxTokens: number;      // e.g. 64000
  responseTokens: number; // reserve tokens for the response
}): { ok: boolean; estimatedTokens: number; available: number } {
  const estimateTokens = (text: string) => Math.ceil(text.length / 3.5); // rough estimate

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

### Malformed Response Handling

```typescript
function safeParseJSON<T>(raw: string): {
  data: T | null;
  error: string | null;
  partial: Record<string, unknown> | null;
} {
  // 1. Try direct parse
  try {
    return { data: JSON.parse(raw) as T, error: null, partial: null };
  } catch {
    // 2. Try extracting JSON from markdown fences
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return { data: JSON.parse(fenceMatch[1]) as T, error: null, partial: null };
      } catch {
        // fall through
      }
    }

    // 3. Try finding {...} or [...] via regex
    const objectMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objectMatch) {
      try {
        return { data: JSON.parse(objectMatch[1]) as T, error: null, partial: null };
      } catch {
        // parse what we can (best-effort)
        try {
          const partial = JSON.parse(objectMatch[1]) as Record<string, unknown>;
          return { data: null, error: "Partial parse succeeded", partial };
        } catch {
          // fall through
        }
      }
    }

    return { data: null, error: `Invalid JSON: ${raw.slice(0, 200)}`, partial: null };
  }
}
```

---

## 5. Token Counting & Context Management

### Token Estimation (Rule of Thumb)

| Language | Tokens per Character | Example |
|---|---|---|
| English | ~1 token per 3.5--4 characters | "Hello world" ≈ 2--3 tokens |
| Chinese | ~1 token per 1.5--2 characters | "你好世界" ≈ 2--4 tokens |
| Code | ~1 token per 3 characters | `const x = 1;` ≈ 4 tokens |
| Mixed | Use 3.5 chars/token as baseline | Safe default |

```typescript
// Quick estimation without a tokenizer
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// More accurate for CJK-heavy text
function estimateTokensAccurate(text: string): number {
  // CJK characters (CJK Unified Ideographs)
  const cjkRegex = /[一-鿿㐀-䶿豈-﫿]/g;
  const cjkCount = (text.match(cjkRegex) || []).length;
  const latinCount = text.length - cjkCount;

  return Math.ceil(cjkCount / 1.5) + Math.ceil(latinCount / 4);
}
```

### DeepSeek Context Window

| Model | Context Window | Effective Usable |
|---|---|---|
| `deepseek-chat` | 64K tokens | ~60K (leave buffer) |

The 64K window means the combined length of (system + history + context + query + response) must fit. For RAG workflows, this budget must be actively managed.

### Budget Management for RAG

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
  retrievedDocs: string[]; // chunked documents
  conversationHistory: string[]; // previous Q&A turns
  userQuery: string;
  reservedResponseTokens: number; // tokens to leave for the answer
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

  // Allocate history first (it gets a fixed budget)
  const historyBudget = 10000; // ~10K tokens for history
  let historyTokens = 0;
  const historyUsed: string[] = [];

  for (const turn of conversationHistory) {
    const turnTokens = estimate(turn);
    if (historyTokens + turnTokens > historyBudget) break;
    historyTokens += turnTokens;
    historyUsed.push(turn);
  }

  // Remaining budget goes to retrieved docs
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

// Usage
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

### Dynamic Compression Strategy

When the budget is tight, apply compression in order:

```
1. Truncate oldest conversation history first  (lowest value)
2. Truncate retrieved docs furthest from query (lowest relevance)
3. Shorten system prompt (remove verbose examples)
4. Shorten user query (last resort)
```

```typescript
function compressToFit(
  docs: Array<{ content: string; score: number }>,
  maxTokens: number,
): string[] {
  // Sort by relevance (highest first), keep what fits
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

## Quick Reference

```typescript
// DeepSeek SDK equivalents (conceptual)
const api = {
  base:  "https://api.deepseek.com/v1",
  chat:  "/chat/completions",
  embed: "/embeddings",
  models: {
    chat: "deepseek-chat",    // 64K context
    embed: "deepseek-embed",  // 1024-dim
  },
};
```

| Task | Endpoint | Method |
|---|---|---|
| Chat (non-streaming) | `POST /v1/chat/completions` | `stream: false` |
| Chat (streaming) | `POST /v1/chat/completions` | `stream: true` |
| Embedding | `POST /v1/embeddings` | — |
| JSON output | `POST /v1/chat/completions` | `response_format: { type: "json_object" }` |

# DeepSeek API 工具调用 — 实践详解

> Agent 的能力边界由工具（Tools）决定。本文深入拆解 DeepSeek API 的 Function Calling 协议、工具定义格式、执行循环、错误处理，以及在 Agent Forge 中的完整集成方案。

---

## 1. Function Calling 协议

### 1.1 什么是 Function Calling？

模型本身不能执行代码、查数据库、调 API。Function Calling 是一种协议：模型"请求"调用某个函数，由你的代码实际执行，将结果返回模型，模型据此生成最终回复。

```
User: "1 + 2 * 3 等于多少？"
  │
  ▼
DeepSeek API (带 tools 定义)
  │
  ▼ 模型返回: tool_calls: [{ function: { name: "calculator", arguments: "1+2*3" } }]
  │
  ▼ 你的代码: executeTool("calculator", "1+2*3") → "7"
  │
  ▼ 将结果返回给模型
  │
  ▼ 模型最终回复: "1 + 2 × 3 = 7"
```

### 1.2 请求格式

```typescript
// backend/src/services/llm/client.ts

const body = {
  model: "deepseek-chat",
  messages: [
    { role: "system", content: "你是一个数学助手" },
    { role: "user", content: "1 + 2 * 3 等于多少？" }
  ],
  tools: [                          // ← 工具定义
    {
      type: "function",
      function: {
        name: "calculator",
        description: "Evaluate mathematical expressions",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "The math expression to evaluate"
            }
          },
          required: ["expression"]
        }
      }
    }
  ],
  tool_choice: "auto",             // 模型自动决定是否调用工具
  temperature: 0.3,
  max_tokens: 2048,
};
```

### 1.3 响应格式

**模型决定调用工具时：**

```json
{
  "choices": [{
    "message": {
      "content": null,
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "calculator",
          "arguments": "{\"expression\": \"1+2*3\"}"
        }
      }]
    }
  }]
}
```

**模型直接回复时：**

```json
{
  "choices": [{
    "message": {
      "content": "1 + 2 × 3 = 7",
      "tool_calls": null
    }
  }]
}
```

---

## 2. 工具定义规范

### 2.1 ToolDefinition 类型

```typescript
interface ToolDefinition {
  type: "function";
  function: {
    name: string;                      // 函数名（模型用来指定调用哪个）
    description: string;               // 描述（模型用来判断何时调用）
    parameters: Record<string, unknown>; // JSON Schema 格式的参数定义
  };
}
```

### 2.2 三个内置工具

```typescript
// backend/src/services/tools/registry.ts

// Calculator — 数学计算
{
  name: "calculator",
  displayName: "Calculator",
  description: "Evaluate mathematical expressions. Use for arithmetic, algebra, statistics, or any calculation.",
  type: "builtin",
  inputSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The math expression to evaluate, e.g. '2+3*4'"
      }
    },
    required: ["expression"]
  }
}

// File Reader — 文件读取
{
  name: "file_reader",
  displayName: "File Reader",
  description: "Read the contents of uploaded files. Use when the user references a file they uploaded.",
  type: "builtin",
  inputSchema: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Name of the file to read"
      }
    },
    required: ["filename"]
  }
}

// Web Search — 网络搜索 (预留)
{
  name: "web_search",
  displayName: "Web Search",
  description: "Search the web for real-time information. Use when the user asks about current events or recent data.",
  type: "builtin",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query"
      }
    },
    required: ["query"]
  }
}
```

### 2.3 工具与 Agent 的关联

```
Agent 表: agent.toolIds = ["uuid-calculator", "uuid-web-search"]

运行时:
  1. 查 tools 表 → 获取所有工具
  2. 过滤 toolIds.includes(t.id) && t.enabled
  3. 映射为 ToolDefinition[] → 传给 chatCompletion
```

---

## 3. 工具执行循环

### 3.1 完整流程

```typescript
// Agent 运行时核心循环

const messages: ChatMessage[] = [
  { role: "system", content: agent.systemPrompt },
  { role: "user", content: userInput },
];

// 最多 10 轮 (防止无限循环)
for (let iteration = 0; iteration < 10; iteration++) {

  // 1. 调用模型
  const response = await chatCompletion(messages, toolDefs, {
    temperature: agent.temperature ?? undefined,
    maxTokens: agent.maxTokens ?? undefined,
  });

  // 2. 有文本内容 → 推送 thinking 事件
  if (response.content) {
    emitSSE(controller, { type: "thinking", step, content: response.content });
  }

  // 3. 有工具调用?
  if (response.tool_calls?.length) {
    // 3a. 将 assistant 消息（含 tool_calls）加入历史
    messages.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.tool_calls,
    });

    // 3b. 逐个执行工具
    for (const tc of response.tool_calls) {
      emitSSE(controller, {
        type: "tool_call",
        step,
        toolName: tc.function.name,
        toolInput: tc.function.arguments,
      });

      const result = await executeTool(tc.function.name, tc.function.arguments);

      emitSSE(controller, {
        type: "tool_result",
        step,
        toolName: tc.function.name,
        toolOutput: result,
        latencyMs: Date.now() - toolStart,
      });

      // 3c. 将工具结果加入历史
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
    }
    // 继续循环 — 模型看到工具结果后可能再次调用工具或生成最终回复
  } else {
    // 4. 无工具调用 → 最终输出
    emitSSE(controller, { type: "agent_output", step, content: response.content || "" });
    break;
  }
}
```

### 3.2 Message 累积示意

```
Round 1:
  messages = [
    { role: "system", content: "..." },
    { role: "user", content: "计算 1+2*3 和 5^2" }
  ]

  模型返回: content="我来计算", tool_calls=[calculator("1+2*3"), calculator("5^2")]
  
  执行后:
  messages = [
    { role: "system", content: "..." },
    { role: "user", content: "计算 1+2*3 和 5^2" },
    { role: "assistant", content: "我来计算", tool_calls: [...] },
    { role: "tool", content: "7", tool_call_id: "call_1" },
    { role: "tool", content: "25", tool_call_id: "call_2" }
  ]

Round 2:
  模型看到工具结果 → content: "1+2×3=7, 5²=25", tool_calls: null
  → break, 输出最终回复
```

---

## 4. 工具执行实现

### 4.1 executeTool 路由

```typescript
// backend/src/services/tools/execute.ts

export async function executeTool(name: string, args: string): Promise<string> {
  try {
    const parsed = JSON.parse(args);

    switch (name) {
      case "calculator":
        return calculatorTool(parsed.expression);

      case "file_reader":
        return fileReaderTool(parsed.filename);

      case "web_search":
        return webSearchTool(parsed.query);

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

### 4.2 Calculator 实现

```typescript
function calculatorTool(expression: string): string {
  try {
    // 安全检查：只允许数学表达式字符
    if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
      return `Invalid expression: "${expression}". Only basic math allowed.`;
    }

    const result = new Function(`return (${expression})`)();
    return String(result);
  } catch (err) {
    return `Calculation error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

### 4.3 工具结果格式

工具返回的是纯文本字符串，模型将其作为 `role: "tool"` 消息的内容处理。返回内容应该：

- **简洁**：只返回必要信息（如计算结果）
- **结构化**：如果返回多条信息，用换行或 JSON 分隔
- **包含错误信息**：如果执行失败，返回明确的错误描述

---

## 5. Chat Completion 客户端

### 5.1 完整实现

```typescript
// backend/src/services/llm/client.ts

export async function chatCompletion(
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<ChatResponse> {
  const body: Record<string, unknown> = {
    model: "deepseek-chat",
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2048,
  };

  // 有工具时附加 tools + tool_choice
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${env.DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const msg = json.choices[0].message;
  return {
    content: msg.content,
    tool_calls: msg.tool_calls,
  };
}
```

### 5.2 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `model` | `deepseek-chat` | 模型名称 |
| `temperature` | `0.3` | 随机性。Agent 场景用低值保证确定性 |
| `max_tokens` | `2048` | 输出最大 token 数 |
| `tools` | `undefined` | 工具定义数组 |
| `tool_choice` | 不传或 `"auto"` | `"auto"` 模型自主决定；`"none"` 不调用工具；`"required"` 强制调用 |

### 5.3 错误处理

```typescript
if (!res.ok) {
  const err = await res.text();
  throw new Error(`DeepSeek API error ${res.status}: ${err}`);
}
```

常见错误：
- `401`: API Key 无效或过期
- `429`: 请求频率超限
- `500`: DeepSeek 服务端错误
- 网络超时：fetch 无预设超时，依赖 Bun 的 `idleTimeout`（已设为 120s）

---

## 6. 环境配置

```bash
# backend/.env
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com  # 或代理地址
```

```typescript
// backend/src/env.ts
const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().default("sk-placeholder"),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
});
```

支持切换 API Base URL，可用于代理或兼容 API（如 OpenAI 兼容的本地模型）。

---

## 7. 工具调用最佳实践

### 7.1 System Prompt 指导

在 Agent 的 system prompt 中明确工具使用方式：

```
你可以使用以下工具:
- calculator: 进行数学计算
- web_search: 搜索最新信息

使用工具时:
1. 先说明你正在使用什么工具
2. 获取结果后，基于结果给出最终回复
3. 如果工具返回错误，告知用户并尝试替代方案
```

### 7.2 避免的陷阱

| 问题 | 原因 | 解决 |
|------|------|------|
| 无限循环调用 | 工具返回结果不能满足模型要求，模型反复调用 | 限制最大 10 轮 |
| 工具未触发 | `tool_choice` 设为 `"none"` 或 description 不匹配 | 检查 tool_choice、优化 description |
| 参数解析失败 | 模型生成的 JSON 格式错误 | `executeTool` 内 try/catch JSON.parse |
| 工具执行超时 | 外部 API 调用时间过长 | 单次工具执行无超时，依赖整体 Bun idleTimeout |

### 7.3 温度参数建议

| 场景 | temperature | 理由 |
|------|-------------|------|
| 工具调用 / 代码生成 | 0.3 | 确定性高，减少参数格式错误 |
| 创意写作 | 0.7 | 输出多样性 |
| 翻译 | 0.5 | 平衡忠实与流畅 |

Agent Forge 中 Agent 默认 temperature = 0.3，适合工具调用场景。

---

## 8. 总结

```
DeepSeek Function Calling = OpenAI 兼容协议
  模型返回 tool_calls → 代码执行工具 → 结果回传模型 → 最终回复

Agent Forge 集成:
  1. tools 表存储工具定义（name + inputSchema + description）
  2. agent.toolIds 关联 Agent 与工具
  3. chatCompletion 动态构建 tools + tool_choice
  4. executeTool 根据 toolName 路由到具体实现
  5. 最多 10 轮循环，支持多工具并行调用
```

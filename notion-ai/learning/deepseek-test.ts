/**
 * DeepSeek API Test Script
 *
 * This file demonstrates calling each DeepSeek API endpoint.
 * It is NOT meant to be run directly — it serves as a reference
 * for integration testing patterns.
 *
 * To run (requires DEEPSEEK_API_KEY env var):
 *   bun run deepseek-test.ts
 *
 * To skip actual API calls (dry-run validation):
 *   DEEPSEEK_API_KEY=test bun run deepseek-test.ts
 */

const BASE = "https://api.deepseek.com/v1";
const API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DRY_RUN = API_KEY === "test" || !API_KEY;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
      refusal: string | null;
    };
    finish_reason: "stop" | "length" | "content_filter";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface EmbeddingResponse {
  object: "list";
  data: {
    object: "embedding";
    index: number;
    embedding: number[];
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// 1. Chat Completion — Non-Streaming
// ---------------------------------------------------------------------------

async function testChatNonStreaming(): Promise<void> {
  console.log("\n=== 1. Chat Completion (non-streaming) ===\n");

  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "You are a concise assistant." },
      { role: "user", content: "What is the capital of France?" },
    ] satisfies ChatMessage[],
    temperature: 0.3,
    max_tokens: 256,
    stream: false,
  };

  if (DRY_RUN) {
    console.log("Request:", JSON.stringify(body, null, 2));
    console.log("Response: (skipped — dry run)");
    return;
  }

  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data: ChatCompletionResponse = await response.json();
  const reply = data.choices[0].message.content;
  const usage = data.usage;

  console.log("Reply:", reply);
  console.log("Usage:", JSON.stringify(usage, null, 2));
  console.log("Finish reason:", data.choices[0].finish_reason);
}

// ---------------------------------------------------------------------------
// 2. Chat Completion — Streaming
// ---------------------------------------------------------------------------

async function testChatStreaming(): Promise<void> {
  console.log("\n=== 2. Chat Completion (streaming) ===\n");

  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Count from 1 to 5." },
    ] satisfies ChatMessage[],
    temperature: 0.7,
    max_tokens: 200,
    stream: true,
  };

  if (DRY_RUN) {
    console.log("Request:", JSON.stringify(body, null, 2));
    console.log("SSE events: (skipped — dry run)");
    return;
  }

  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parts: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const payload = trimmed.slice(6);
      if (payload === "[DONE]") {
        console.log("Stream complete.");
        break;
      }

      try {
        const parsed = JSON.parse(payload);
        const token = parsed.choices?.[0]?.delta?.content ?? "";
        if (token) {
          parts.push(token);
          process.stdout.write(token); // print tokens as they arrive
        }
      } catch {
        // skip malformed SSE line
      }
    }
  }

  console.log("\n\nFull reply:", parts.join(""));
  reader.releaseLock();
}

// ---------------------------------------------------------------------------
// 3. Embedding API
// ---------------------------------------------------------------------------

async function testEmbedding(): Promise<void> {
  console.log("\n=== 3. Embedding API ===\n");

  const input = [
    "Retrieval-Augmented Generation combines retrieval with generation.",
    "DeepSeek supports both chat and embedding models.",
    "Cosine similarity measures semantic closeness between vectors.",
  ];

  const body = {
    model: "deepseek-embed",
    input,
  };

  if (DRY_RUN) {
    console.log("Request (batch of 3 texts):", JSON.stringify(body, null, 2));
    console.log("Expected response: 3 embedding vectors, 1024-dim each");
    return;
  }

  const response = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data: EmbeddingResponse = await response.json();

  console.log(`Received ${data.data.length} embeddings`);
  console.log(`Model: ${data.model}`);
  console.log(`Usage: ${JSON.stringify(data.usage)}`);

  for (const item of data.data) {
    console.log(
      `  [${item.index}] dim=${item.embedding.length}, ` +
      `first 5 values: [${item.embedding.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}...]`
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Structured Output (JSON Mode)
// ---------------------------------------------------------------------------

async function testJSONMode(): Promise<void> {
  console.log("\n=== 4. Structured Output (JSON Mode) ===\n");

  const body = {
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "You output valid JSON only. Extract event details into the schema: " +
          '{ "title": string, "date": string (ISO), "participants": number, "category": string }',
      },
      {
        role: "user",
        content:
          "Schedule a team standup for tomorrow at 10am. There are 8 people on the team. " +
          "This is a recurring daily meeting.",
      },
    ] satisfies ChatMessage[],
    response_format: { type: "json_object" } as const,
    temperature: 0.1,
    max_tokens: 500,
  };

  if (DRY_RUN) {
    console.log("Request:", JSON.stringify(body, null, 2));
    console.log("Expected: valid JSON matching the schema");
    return;
  }

  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data: ChatCompletionResponse = await response.json();

  // Parse and print the structured output
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    console.log("Parsed result:", JSON.stringify(parsed, null, 2));
  } catch {
    console.error("Failed to parse JSON from model response:");
    console.error(data.choices[0].message.content);
  }
}

// ---------------------------------------------------------------------------
// 5. Error Handling — Retry Wrapper
// ---------------------------------------------------------------------------

async function testRetryWrapper(): Promise<void> {
  console.log("\n=== 5. Retry Wrapper Demonstration ===\n");

  let attemptCount = 0;

  // Simulate an API that fails twice then succeeds
  async function flakyAPI(): Promise<string> {
    attemptCount++;
    if (attemptCount <= 2) {
      throw new Error(`Simulated failure (attempt ${attemptCount})`);
    }
    return "Success on attempt " + attemptCount;
  }

  // The retry wrapper
  async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 100,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.log(`  Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  const result = await withRetry(() => flakyAPI());
  console.log("  Result:", result);
}

// ---------------------------------------------------------------------------
// 6. Token Budget Estimation
// ---------------------------------------------------------------------------

function testTokenBudget(): void {
  console.log("\n=== 6. Token Budget Estimation ===\n");

  const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

  const systemPrompt = "You are a helpful RAG assistant.";
  const docs = [
    "DeepSeek API supports chat completion with streaming.",
    "The embedding endpoint returns 1024-dimensional vectors.",
    "JSON mode forces structured output from the model.",
  ];
  const history = ["What is RAG?", "RAG stands for Retrieval-Augmented Generation."];
  const query = "How do I use the embedding API?";
  const reservedResponse = 4096;

  const totalTokens =
    estimateTokens(systemPrompt) +
    docs.reduce((sum, d) => sum + estimateTokens(d), 0) +
    history.reduce((sum, h) => sum + estimateTokens(h), 0) +
    estimateTokens(query);

  console.log(`Token estimates:`);
  console.log(`  System prompt:  ${estimateTokens(systemPrompt)}`);
  console.log(`  Docs (3):       ${docs.reduce((s, d) => s + estimateTokens(d), 0)}`);
  console.log(`  History (2):    ${history.reduce((s, h) => s + estimateTokens(h), 0)}`);
  console.log(`  Query:          ${estimateTokens(query)}`);
  console.log(`  Reserved:       ${reservedResponse}`);
  console.log(`  Total (w/o reserved): ${totalTokens}`);
  console.log(`  Within 64K budget:    ${totalTokens + reservedResponse <= 64000}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`DeepSeek API test script (DRY_RUN=${DRY_RUN})`);

  try {
    await testChatNonStreaming();
    await testChatStreaming();
    await testEmbedding();
    await testJSONMode();
    await testRetryWrapper();
    testTokenBudget();

    console.log("\n\nAll tests completed successfully.");
  } catch (err) {
    console.error("\nTest failed:", err);
    process.exit(1);
  }
}

await main();

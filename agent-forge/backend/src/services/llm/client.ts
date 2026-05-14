import { env } from "../../env";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatResponse {
  content: string | null;
  tool_calls: ToolCall[] | null;
}

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

  const json = await res.json() as {
    choices: [{ message: { content: string | null; tool_calls: ToolCall[] | null } }];
  };

  const msg = json.choices[0].message;
  return { content: msg.content, tool_calls: msg.tool_calls };
}

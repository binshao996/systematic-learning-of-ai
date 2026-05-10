import { env } from "../../env";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function deepseekChat(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; stream?: boolean }
): Promise<Response> {
  const res = await fetch(`${env.DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2048,
      stream: options?.stream ?? false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  return res;
}

export async function deepseekEmbed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${env.DEEPSEEK_BASE_URL}/v1/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-embed",
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek Embedding error ${res.status}: ${err}`);
  }

  const json = await res.json() as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

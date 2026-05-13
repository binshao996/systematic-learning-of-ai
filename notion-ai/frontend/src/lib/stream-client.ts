const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface SSEChatOptions {
  message: string;
  docId?: string;
  sessionId?: string;
  signal?: AbortSignal;
  onChunk: (fullText: string, delta: string) => void;
}

/**
 * Core SSE streaming chat — shared by useStreamingChat and AIBlockView.
 * Returns the complete response text.
 */
export async function streamSSEChat({
  message,
  docId,
  sessionId,
  signal,
  onChunk,
}: SSEChatOptions): Promise<string> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, docId, sessionId }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") {
        try {
          const chunk = JSON.parse(line.slice(6)) as {
            choices: { delta: { content: string } }[];
          };
          const delta = chunk.choices[0]?.delta?.content ?? "";
          fullText += delta;
          onChunk(fullText, delta);
        } catch {}
      }
    }
  }

  return fullText;
}

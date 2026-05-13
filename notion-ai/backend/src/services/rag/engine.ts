import { retrieve } from "./retriever";
import { generateStream, generateSync } from "./generator";
import { deepseekChat } from "../deepseek/client";

export async function ragQuery(
  query: string,
  options?: { docId?: string; topK?: number }
): Promise<Response> {
  try {
    const chunks = await retrieve(query, options);
    if (chunks.length > 0) {
      return generateStream(query, chunks);
    }
  } catch (err) {
    console.warn("Retrieval failed, falling back to direct chat:", (err as Error).message);
  }
  // Fallback: direct chat without RAG context
  return deepseekChat(
    [
      { role: "system", content: "You are a helpful AI assistant. Answer the user's questions accurately and concisely." },
      { role: "user", content: query },
    ],
    { stream: true, temperature: 0.3 }
  );
}

export async function ragQuerySync(
  query: string,
  options?: { docId?: string; topK?: number }
) {
  const chunks = await retrieve(query, options);
  return generateSync(query, chunks);
}

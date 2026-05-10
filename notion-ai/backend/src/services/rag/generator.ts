import { deepseekChat } from "../deepseek/client";
import { RAG_SYSTEM_PROMPT } from "../../lib/prompts";
import { extractCitations } from "../../lib/citation";
import type { RetrievedChunk } from "./retriever";

export interface RAGResponse {
  answer: string;
  citations: { chunkId: string; text: string }[];
}

export async function generateStream(
  query: string,
  retrievedChunks: RetrievedChunk[]
): Promise<Response> {
  const context = retrievedChunks
    .map((c) => `[chunk:${c.chunkId}]\nSource: ${c.docTitle}\nSection: ${c.headingPath.join(" > ")}\n${c.text}`)
    .join("\n\n");

  const systemPrompt = RAG_SYSTEM_PROMPT.replace("{context}", context);

  return deepseekChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    { stream: true, temperature: 0.3 }
  );
}

export async function generateSync(
  query: string,
  retrievedChunks: RetrievedChunk[]
): Promise<RAGResponse> {
  const context = retrievedChunks
    .map((c) => `[chunk:${c.chunkId}]\nSource: ${c.docTitle}\n${c.text}`)
    .join("\n\n");

  const systemPrompt = RAG_SYSTEM_PROMPT.replace("{context}", context);

  const res = await deepseekChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    { stream: false, temperature: 0.3 }
  );

  const json = await res.json() as { choices: { message: { content: string } }[] };
  const answer = json.choices[0].message.content;

  const citations = extractCitations(answer, retrievedChunks);

  return { answer, citations };
}

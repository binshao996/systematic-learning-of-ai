import { deepseekEmbed } from "../deepseek/client";
import { searchChunks } from "../qdrant";

export interface RetrievedChunk {
  chunkId: string;
  docId: string;
  docTitle: string;
  text: string;
  score: number;
  headingPath: string[];
}

export async function retrieve(
  query: string,
  options?: { docId?: string; topK?: number }
): Promise<RetrievedChunk[]> {
  const queryVector = (await deepseekEmbed([query]))[0];
  const results = await searchChunks(queryVector, {
    limit: options?.topK ?? 5,
    filter: options?.docId ? { docId: options.docId } : undefined,
  });

  return results.map((r) => ({
    chunkId: r.id,
    docId: r.payload.docId as string,
    docTitle: (r.payload.docTitle as string) ?? "Unknown",
    text: r.payload.text as string,
    score: r.score,
    headingPath: (r.payload.headingPath as string[]) ?? [],
  }));
}

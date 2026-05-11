import { retrieve } from "./retriever";
import { generateStream, generateSync } from "./generator";

export async function ragQuery(
  query: string,
  options?: { docId?: string; topK?: number }
): Promise<Response> {
  const chunks = await retrieve(query, options);
  return generateStream(query, chunks);
}

export async function ragQuerySync(
  query: string,
  options?: { docId?: string; topK?: number }
) {
  const chunks = await retrieve(query, options);
  return generateSync(query, chunks);
}

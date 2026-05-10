import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../env";

export const qdrant = new QdrantClient({ url: env.QDRANT_URL });

const COLLECTION = "document_chunks";
const VECTOR_SIZE = 1536; // DeepSeek embedding dimension

export async function ensureCollection(): Promise<void> {
  const exists = (await qdrant.getCollections()).collections
    .find((c) => c.name === COLLECTION);

  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
  }
}

export async function upsertChunks(
  points: { id: string; vector: number[]; payload: Record<string, unknown> }[]
): Promise<void> {
  await qdrant.upsert(COLLECTION, { points });
}

export async function searchChunks(
  vector: number[],
  options: {
    limit?: number;
    filter?: { docId?: string };
  }
): Promise<{ id: string; score: number; payload: Record<string, unknown> }[]> {
  const filter = options.filter?.docId
    ? { must: [{ key: "docId", match: { value: options.filter.docId } }] }
    : undefined;

  const res = await qdrant.search(COLLECTION, {
    vector,
    limit: options.limit ?? 5,
    filter,
    with_payload: true,
  });

  return res.map((r) => ({
    id: r.id as string,
    score: r.score,
    payload: r.payload as Record<string, unknown>,
  }));
}

export async function deleteDocChunks(docId: string): Promise<void> {
  await qdrant.delete(COLLECTION, {
    filter: { must: [{ key: "docId", match: { value: docId } }] },
  });
}

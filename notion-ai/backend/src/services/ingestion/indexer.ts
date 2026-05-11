import { deepseekEmbed } from "../deepseek/client";
import { qdrant, upsertChunks, ensureCollection, deleteDocChunks } from "../qdrant";
import { db } from "../../db/connection";
import { chunks, documents } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { Chunk } from "./chunker";

const BATCH_SIZE = 20;

export async function indexChunks(docId: string, textChunks: Chunk[]): Promise<void> {
  await ensureCollection();
  await deleteDocChunks(docId);

  for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
    const batch = textChunks.slice(i, i + BATCH_SIZE);
    const vectors = await deepseekEmbed(batch.map((c) => c.text));

    const points = await Promise.all(
      batch.map(async (chunk, j) => {
        const [row] = await db.insert(chunks).values({
          docId,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          headingPath: chunk.headingPath,
        }).returning();

        return {
          id: row.id,
          vector: vectors[j],
          payload: {
            docId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            headingPath: chunk.headingPath,
            charStart: chunk.charStart,
            charEnd: chunk.charEnd,
          },
        };
      })
    );

    await upsertChunks(points);

    for (const point of points) {
      await db.update(chunks)
        .set({ qdrantPointId: point.id })
        .where(eq(chunks.id, point.id));
    }
  }

  await db.update(documents)
    .set({ updatedAt: new Date() })
    .where(eq(documents.id, docId));
}

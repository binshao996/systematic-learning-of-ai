import { parseFile } from "./parser";
import { chunkDocument } from "./chunker";
import { indexChunks } from "./indexer";
import { db } from "../../db/connection";
import { documents } from "../../db/schema";
import { eq } from "drizzle-orm";

export async function ingestDocument(
  buffer: ArrayBuffer,
  fileName: string,
  docId: string
): Promise<{ chunkCount: number }> {
  const parsed = await parseFile(buffer, fileName);

  await db.update(documents)
    .set({ title: fileName.replace(/\.[^.]+$/, ""), updatedAt: new Date() })
    .where(eq(documents.id, docId));

  const chunks = chunkDocument(parsed.text, "semantic");
  await indexChunks(docId, chunks);

  return { chunkCount: chunks.length };
}

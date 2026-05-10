import { parseFile } from "./parser";
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

  return { chunkCount: parsed.sections.length };
}

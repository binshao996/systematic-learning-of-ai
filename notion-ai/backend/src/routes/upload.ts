import { Hono } from "hono";
import { db } from "../db/connection";
import { documents } from "../db/schema";
import { ingestDocument } from "../services/ingestion/pipeline";

export const uploadRoute = new Hono()
  .post("/", async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    if (!file) return c.json({ error: "No file provided" }, 400);

    const parentId = formData.get("parentId") as string | undefined;

    const [doc] = await db.insert(documents).values({
      title: file.name,
      parentId: parentId ?? null,
    }).returning();

    const buffer = await file.arrayBuffer();
    const result = await ingestDocument(buffer, file.name, doc.id);

    return c.json({ docId: doc.id, ...result }, 201);
  });

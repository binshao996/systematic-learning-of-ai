import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/connection";
import { documents } from "../db/schema";
import { eq, isNull } from "drizzle-orm";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const documentsRoute = new Hono()
  .post("/", zValidator("json", z.object({ title: z.string().optional(), parentId: z.string().optional() })), async (c) => {
    const { title, parentId } = c.req.valid("json");
    const [doc] = await db.insert(documents).values({
      title: title ?? "Untitled",
      parentId: parentId ?? null,
    }).returning();
    return c.json(doc, 201);
  })
  .get("/", async (c) => {
    const docs = await db.select().from(documents).where(isNull(documents.parentId));
    return c.json(docs);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidRegex.test(id)) return c.json({ error: "Invalid document ID" }, 400);
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return c.json({ error: "Not found" }, 404);
    const children = await db.select().from(documents).where(eq(documents.parentId, id));
    return c.json({ ...doc, children });
  })
  .patch("/:id", zValidator("json", z.object({ title: z.string().optional(), content: z.any().optional() })), async (c) => {
    const id = c.req.param("id");
    if (!uuidRegex.test(id)) return c.json({ error: "Invalid document ID" }, 400);
    const data = c.req.valid("json");
    const [doc] = await db.update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return c.json(doc);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidRegex.test(id)) return c.json({ error: "Invalid document ID" }, 400);
    await db.delete(documents).where(eq(documents.id, id));
    return c.json({ success: true });
  });

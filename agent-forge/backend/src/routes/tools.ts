import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/connection";
import { tools } from "../db/schema";
import { eq } from "drizzle-orm";

export const toolsRoute = new Hono();

toolsRoute.get("/", async (c) => {
  const result = await db.select().from(tools).orderBy(tools.name);
  return c.json(result);
});

toolsRoute.get("/:id", async (c) => {
  const result = await db.select().from(tools).where(eq(tools.id, c.req.param("id")));
  if (result.length === 0) return c.json({ error: "Tool not found" }, 404);
  return c.json(result[0]);
});

const toolSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["builtin", "custom"]).optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

toolsRoute.post("/", zValidator("json", toolSchema), async (c) => {
  const body = c.req.valid("json");
  const [tool] = await db.insert(tools).values({
    name: body.name,
    displayName: body.displayName,
    description: body.description,
    type: body.type || "builtin",
    inputSchema: body.inputSchema,
    config: body.config || {},
    enabled: body.enabled ?? true,
  }).returning();
  return c.json(tool, 201);
});

toolsRoute.patch("/:id", zValidator("json", toolSchema.partial()), async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(tools).where(eq(tools.id, id));
  if (existing.length === 0) return c.json({ error: "Tool not found" }, 404);

  const body = c.req.valid("json");
  const [updated] = await db.update(tools)
    .set(body)
    .where(eq(tools.id, id))
    .returning();
  return c.json(updated);
});

toolsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(tools).where(eq(tools.id, id));
  if (existing.length === 0) return c.json({ error: "Tool not found" }, 404);

  await db.delete(tools).where(eq(tools.id, id));
  return c.json({ success: true });
});

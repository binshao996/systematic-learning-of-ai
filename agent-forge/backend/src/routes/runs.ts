import { Hono } from "hono";
import { db } from "../db/connection";
import { runs } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export const runsRoute = new Hono();

runsRoute.get("/", async (c) => {
  const result = await db.select().from(runs).orderBy(desc(runs.createdAt)).limit(50);
  return c.json(result);
});

runsRoute.get("/:id", async (c) => {
  const result = await db.select().from(runs).where(eq(runs.id, c.req.param("id")));
  if (result.length === 0) return c.json({ error: "Run not found" }, 404);
  return c.json(result[0]);
});

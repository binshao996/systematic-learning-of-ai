import { Hono } from "hono";
import { retrieve } from "../services/rag/retriever";

export const searchRoute = new Hono()
  .get("/", async (c) => {
    const query = c.req.query("q");
    if (!query) return c.json({ error: "Missing query parameter 'q'" }, 400);

    const docId = c.req.query("docId");
    const results = await retrieve(query, { docId, topK: 10 });

    return c.json(results);
  });

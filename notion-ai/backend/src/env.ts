import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default("postgres://notion:notionpass@localhost:5432/notion_ai"),
  QDRANT_URL: z.string().default("http://localhost:6333"),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default("minioadmin"),
  MINIO_SECRET_KEY: z.string().default("minioadmin"),
  DEEPSEEK_API_KEY: z.string().default("sk-placeholder"),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  EMBEDDING_API_URL: z.string().default(""),
  EMBEDDING_API_KEY: z.string().default(""),
  EMBEDDING_MODEL: z.string().default(""),
});

export const env = envSchema.parse(process.env);

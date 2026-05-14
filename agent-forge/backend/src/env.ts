import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().default("postgres://agentforge:agentforgepass@localhost:5433/agent_forge"),
  QDRANT_URL: z.string().default("http://localhost:6335"),
  DEEPSEEK_API_KEY: z.string().default("sk-placeholder"),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
});

export const env = envSchema.parse(process.env);

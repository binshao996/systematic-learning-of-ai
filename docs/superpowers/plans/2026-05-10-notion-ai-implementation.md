# 类 Notion AI 知识平台 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an enterprise-grade Notion-like AI knowledge platform with RAG-powered Q&A, hybrid search, document ingestion, and AI-assisted writing — using DeepSeek API across the full pipeline.

**Architecture:** Next.js 14 frontend with TipTap block editor communicates with a Bun + Hono backend over SSE for AI streaming. The backend orchestrates DeepSeek Chat/Embedding APIs, Qdrant vector search, PostgreSQL metadata, and MinIO file storage. A document ingestion pipeline parses PDF/Word/Markdown into semantically chunked embeddings. RAG answers include inline citations traced back to source document blocks.

**Tech Stack:** Next.js 14 App Router, TipTap editor, TailwindCSS + shadcn/ui, Bun + Hono, PostgreSQL + Drizzle ORM, Qdrant, MinIO, DeepSeek API (Chat + Embedding + Structured Output), Docker Compose.

---

## File Structure

```
notion-ai/
├── docker-compose.yml               # postgres + qdrant + minio
├── .env.example
├── .gitignore
├── README.md
├── frontend/                         # Next.js 14 App Router
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── components.json               # shadcn/ui config
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout (providers, fonts)
│   │   │   ├── page.tsx              # Home / redirect
│   │   │   └── (main)/
│   │   │       ├── layout.tsx        # Sidebar + main area shell
│   │   │       └── [docId]/
│   │   │           └── page.tsx      # Document editor page
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── tip-tap-editor.tsx
│   │   │   │   ├── editor-toolbar.tsx
│   │   │   │   └── ai-writing-menu.tsx
│   │   │   ├── sidebar/
│   │   │   │   ├── doc-tree.tsx
│   │   │   │   ├── doc-tree-item.tsx
│   │   │   │   └── new-doc-button.tsx
│   │   │   ├── search/
│   │   │   │   ├── search-dialog.tsx
│   │   │   │   └── search-result-item.tsx
│   │   │   ├── chat/
│   │   │   │   ├── chat-panel.tsx
│   │   │   │   ├── chat-message.tsx
│   │   │   │   └── citation-link.tsx
│   │   │   ├── upload/
│   │   │   │   └── upload-dialog.tsx
│   │   │   └── ui/                   # shadcn/ui generated components
│   │   ├── hooks/
│   │   │   ├── use-debounce.ts
│   │   │   └── use-streaming-chat.ts
│   │   ├── lib/
│   │   │   ├── api-client.ts         # fetch wrapper with SSE support
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── index.ts              # Shared types: Doc, Chunk, ChatMessage, SearchResult
│   └── public/
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                  # Hono app entry, route mounting, CORS
│   │   ├── env.ts                    # Environment variable validation
│   │   ├── db/
│   │   │   ├── connection.ts         # Drizzle + postgres connection
│   │   │   └── schema.ts            # documents, chunks, chat_sessions, chat_messages
│   │   ├── routes/
│   │   │   ├── documents.ts          # CRUD /api/documents
│   │   │   ├── search.ts             # GET /api/search?q=...
│   │   │   ├── chat.ts               # POST /api/chat (SSE stream)
│   │   │   └── upload.ts             # POST /api/upload
│   │   ├── services/
│   │   │   ├── deepseek/
│   │   │   │   ├── client.ts         # DeepSeek HTTP client (fetch wrapper)
│   │   │   │   ├── chat.ts           # Chat completion + streaming
│   │   │   │   └── embedding.ts      # Batch embedding API
│   │   │   ├── rag/
│   │   │   │   ├── engine.ts         # RAG orchestrator: retrieve → augment → generate
│   │   │   │   ├── retriever.ts      # Hybrid search (BM25 full-text + vector)
│   │   │   │   └── generator.ts      # Prompt builder + DeepSeek call + citation extraction
│   │   │   ├── ingestion/
│   │   │   │   ├── pipeline.ts       # Orchestrates: parse → chunk → embed → index
│   │   │   │   ├── parser.ts         # File type detection + parse (PDF/Word/MD/TXT)
│   │   │   │   ├── chunker.ts        # Text splitting strategies (fixed/semantic/recursive)
│   │   │   │   └── indexer.ts        # Embedding batch + Qdrant upsert
│   │   │   └── qdrant.ts            # Qdrant client: create collection, upsert, search, scroll
│   │   └── lib/
│   │       ├── prompts.ts            # All system/user prompt templates
│   │       └── citation.ts           # Extract citation markers from LLM output
│   └── test/
│       ├── setup.ts                  # Test env setup (in-memory DB, mock Qdrant)
│       ├── services/
│       │   ├── chunker.test.ts
│       │   ├── retriever.test.ts
│       │   ├── generator.test.ts
│       │   └── citation.test.ts
│       └── routes/
│           ├── documents.test.ts
│           └── search.test.ts
└── learning/                         # Structured learning notes & experiments
    ├── 01-rag-deep-dive.md
    ├── 02-deepseek-api.md
    ├── 03-qdrant-practice.md
    └── 04-doc-parsing.md
```

---

## Phase 0: Environment Setup

### Task 1: Docker Compose — Infrastructure Services

**Files:**
- Create: `notion-ai/docker-compose.yml`
- Create: `notion-ai/.env.example`
- Create: `notion-ai/.gitignore`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
version: "3.9"
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: notion
      POSTGRES_PASSWORD: notionpass
      POSTGRES_DB: notion_ai
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  pgdata:
  qdrant_data:
  minio_data:
```

- [ ] **Step 2: Write .env.example**

```bash
# Backend
PORT=3001
DATABASE_URL=postgres://notion:notionpass@localhost:5432/notion_ai
QDRANT_URL=http://localhost:6334
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Step 3: Write .gitignore**

```
node_modules/
dist/
.env
*.log
.DS_Store
```

- [ ] **Step 4: Start infrastructure and verify**

Run: `docker compose up -d`
Run: `docker compose ps`
Expected: postgres, qdrant, minio all running

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "chore: add Docker Compose infrastructure and env template"
```

---

### Task 2: Scaffold Backend — Hono + Bun Project

**Files:**
- Create: `notion-ai/backend/package.json`
- Create: `notion-ai/backend/tsconfig.json`
- Create: `notion-ai/backend/src/index.ts`
- Create: `notion-ai/backend/src/env.ts`

- [ ] **Step 1: Initialize backend project**

Run: `cd notion-ai && mkdir -p backend/src && cd backend && bun init -y`

- [ ] **Step 2: Install dependencies**

Run: `cd backend && bun add hono drizzle-orm postgres @qdrant/js-client-rest minio`
Run: `cd backend && bun add -d @types/node typescript bun-types`

- [ ] **Step 3: Write package.json scripts section**

```json
{
  "name": "notion-ai-backend",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "test": "bun test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run src/db/migrate.ts"
  }
}
```

- [ ] **Step 4: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Write env.ts**

```typescript
import { z } from "zod";
// bun add zod

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string(),
  QDRANT_URL: z.string(),
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.coerce.number(),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  DEEPSEEK_API_KEY: z.string(),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 6: Write minimal Hono entry point**

```typescript
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default {
  port: env.PORT,
  fetch: app.fetch,
};
```

- [ ] **Step 7: Start server and verify**

Run: `cd backend && bun run dev`
Run: `curl http://localhost:3001/api/health`
Expected: `{"status":"ok"}`

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: scaffold Hono backend with env validation"
```

---

### Task 3: Scaffold Frontend — Next.js 14 + shadcn/ui

**Files:**
- Create: `notion-ai/frontend/` (via create-next-app)
- Create: `notion-ai/frontend/src/types/index.ts`

- [ ] **Step 1: Create Next.js project**

Run: `cd notion-ai && bun create next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias`

- [ ] **Step 2: Install dependencies**

Run: `cd frontend && bun add @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/extension-highlight zustand`
Run: `cd frontend && bun add -D @types/node`

- [ ] **Step 3: Initialize shadcn/ui**

Run: `cd frontend && npx shadcn-ui@latest init` (defaults, style: new-york, base: zinc)
Run: `cd frontend && npx shadcn-ui@latest add button input dialog sheet command tooltip`

- [ ] **Step 4: Write shared types**

```typescript
// src/types/index.ts
export interface Doc {
  id: string;
  title: string;
  parentId: string | null;
  content: object; // TipTap JSON
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  docId: string;
  docTitle: string;
  chunkId: string;
  text: string;
  score: number;
  highlights: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
}

export interface Citation {
  chunkId: string;
  docId: string;
  docTitle: string;
  text: string;
  startIndex: number;
  endIndex: number;
}
```

- [ ] **Step 5: Clean up default Next.js page**

Replace `src/app/page.tsx` with a minimal redirect to the first document or an empty page.

- [ ] **Step 6: Verify dev server**

Run: `cd frontend && bun dev`
Open: `http://localhost:3000`
Expected: Empty page, no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Next.js 14 frontend with TipTap, shadcn/ui, shared types"
```

---

## Phase 1: Structured Learning (Weeks 1-2)

### Task 4: Learning — RAG Deep Dive

**Goal:** Understand RAG end-to-end at a theoretical and practical level. No project code yet.

**Files:**
- Create: `notion-ai/learning/01-rag-deep-dive.md`

- [ ] **Step 1: Study Embedding fundamentals**

Read: https://platform.openai.com/docs/guides/embeddings (concepts apply to DeepSeek)
Key concepts: cosine similarity, embedding dimensions, context window limits.

Write notes in `learning/01-rag-deep-dive.md`:
- What is an embedding vector and how is it generated?
- How does cosine similarity work for retrieval?
- What are the tradeoffs of different embedding models (dimension size, multilingual support)?

- [ ] **Step 2: Study chunking strategies**

Read about: Fixed-size, recursive character, semantic, and agentic chunking.

Write notes covering:
- Pros/cons of each strategy
- How chunk size affects retrieval quality
- Overlap: why and how much?

- [ ] **Step 3: Study retrieval approaches**

Read about: Dense retrieval, sparse retrieval (BM25), hybrid search, reranking.

Write notes covering:
- BM25 vs vector search — when to use each
- Hybrid search weight tuning
- Reranking models (Cohere, BGE-reranker)

- [ ] **Step 4: Study RAG pipeline patterns**

Read about: Naive RAG, Advanced RAG (query transformation, multi-step retrieval), Modular RAG.

Write notes covering:
- Query rewriting/decomposition
- Context window optimization
- Citation strategies

- [ ] **Step 5: Write a mini RAG experiment script (read-only, throwaway)**

Create a small node script that:
- Calls DeepSeek Embedding API for a few hardcoded documents
- Stores in memory (no Qdrant yet)
- Does cosine similarity search
- Calls DeepSeek Chat with retrieved context

- [ ] **Step 6: Commit**

```bash
git add learning/01-rag-deep-dive.md
git commit -m "learn: RAG deep dive notes and embedding experiment"
```

---

### Task 5: Learning — DeepSeek API Mastery

**Goal:** Thoroughly learn all relevant DeepSeek API endpoints and their nuances.

**Files:**
- Create: `notion-ai/learning/02-deepseek-api.md`

- [ ] **Step 1: Study Chat Completion API**

Read: DeepSeek API docs for `/v1/chat/completions`

Write notes and test scripts for:
- Basic chat completion
- System + user + assistant message structure
- `temperature`, `top_p`, `max_tokens` parameters
- Streaming with `stream: true` (SSE parsing)

- [ ] **Step 2: Study Embedding API**

Read: DeepSeek embedding endpoint

Write notes and test scripts for:
- Batch embedding (multiple texts per request)
- Dimension configuration
- Rate limits and pricing

- [ ] **Step 3: Study Structured Output (JSON mode)**

Read: DeepSeek's JSON mode / function calling

Write a test script that:
- Prompts DeepSeek to output structured JSON
- Uses `response_format: { type: "json_object" }`
- Parses and validates the response

- [ ] **Step 4: Study error handling and retry patterns**

Write a test script that handles:
- Rate limiting (429 → exponential backoff)
- Timeout handling
- Token limit exceeded
- Malformed response

- [ ] **Step 5: Study Token counting and context management**

Write notes on:
- How to count tokens (approximation: 1 token ≈ 0.75 words for Chinese, 0.75 words for English)
- Context window limitations (DeepSeek: 64K tokens)
- Budget management for RAG (system prompt + retrieved context + user query + history)

- [ ] **Step 6: Commit**

```bash
git add learning/02-deepseek-api.md
git commit -m "learn: DeepSeek API mastery — chat, embedding, structured output, error handling"
```

---

### Task 6: Learning — Qdrant Hands-On

**Goal:** Get comfortable with Qdrant APIs for the project.

**Files:**
- Create: `notion-ai/learning/03-qdrant-practice.md`

- [ ] **Step 1: Create Qdrant client and collection**

Write a throwaway script that:
- Connects to local Qdrant (Docker)
- Creates a collection with proper vector config
- Verifies collection exists

- [ ] **Step 2: Insert and search vectors**

Write a throwaway script that:
- Inserts points with payloads (docId, chunkIndex, text)
- Does vector search with filters
- Does hybrid search (dense + sparse) if supported
- Tests payload filtering

- [ ] **Step 3: Test scroll and batch operations**

Write a throwaway script that:
- Uses scroll API for pagination
- Does batch upsert (100+ points)
- Deletes by filter

- [ ] **Step 4: Plan collection design for the project**

Design the Qdrant collection schema:
```
Collection: "document_chunks"
  - id: UUID
  - vector: 1536-d (DeepSeek embedding dim)
  - payload:
    - docId: string
    - chunkIndex: number
    - text: string
    - headingPath: string[]   (e.g., ["Chapter 1", "Section 1.1"])
    - pageNumber: number | null
    - sourceFile: string
```

Write notes on this design and commit.

- [ ] **Step 5: Commit**

```bash
git add learning/03-qdrant-practice.md
git commit -m "learn: Qdrant hands-on — collection design, search, batch operations"
```

---

### Task 7: Learning — Document Parsing Pipeline

**Goal:** Understand how to parse PDF/Word/Markdown into clean text for chunking.

**Files:**
- Create: `notion-ai/learning/04-doc-parsing.md`

- [ ] **Step 1: Study PDF parsing options**

Research and test:
- `unpdf` (MIT, lightweight, based on Mozilla's PDF.js)
- `pdf-parse` (popular, simple API)

Write a test script that parses a sample PDF and extracts:
- Full text
- Page numbers
- Basic table detection (what's possible with each library)

- [ ] **Step 2: Study Word (.docx) parsing**

Research and test `mammoth` — extracts text from .docx.

Write a test script that parses a sample .docx with:
- Headings (h1-h6 hierarchy)
- Tables
- Images (extract to MinIO, insert placeholder)

- [ ] **Step 3: Study Markdown parsing**

Test parsing Markdown with:
- `remark`/`unified` for AST parsing
- Extract heading hierarchy, code blocks, links

- [ ] **Step 4: Write the unified parser design**

Design the parser interface:
```typescript
interface ParsedDocument {
  text: string;
  sections: Section[];
  metadata: {
    sourceFile: string;
    fileType: "pdf" | "docx" | "md" | "txt";
    pageCount: number | null;
    headings: string[];
  };
}

interface Section {
  heading: string;
  headingLevel: number;
  content: string;
  pageNumber: number | null;
  hasTable: boolean;
  hasCode: boolean;
}
```

- [ ] **Step 5: Commit**

```bash
git add learning/04-doc-parsing.md
git commit -m "learn: document parsing — PDF, Word, Markdown parsing strategies"
```

---

## Phase 2: Backend Core (Week 3)

### Task 8: Database Schema — Drizzle ORM

**Files:**
- Create: `notion-ai/backend/src/db/connection.ts`
- Create: `notion-ai/backend/src/db/schema.ts`
- Create: `notion-ai/backend/src/db/migrate.ts`

- [ ] **Step 1: Write database connection**

```typescript
// src/db/connection.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";

const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient);
```

- [ ] **Step 2: Write schema.ts**

```typescript
// src/db/schema.ts
import { pgTable, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull().default("Untitled"),
  parentId: uuid("parent_id"),
  content: jsonb("content").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chunks = pgTable("chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  docId: uuid("doc_id").references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  headingPath: jsonb("heading_path").default([]),
  qdrantPointId: uuid("qdrant_point_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  docId: uuid("doc_id").references(() => documents.id, { onDelete: "cascade" }),
  title: text("title").default("New Chat"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  citations: jsonb("citations").default([]),
  createdAt: timestamp("created_at").defaultNow(),
});
```

- [ ] **Step 3: Write Drizzle config and migration setup**

Create `drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Run: `bun run db:generate`
Run: `bun run db:migrate`

- [ ] **Step 4: Verify tables exist**

Run: `docker compose exec postgres psql -U notion -d notion_ai -c "\dt"`
Expected: documents, chunks, chat_sessions, chat_messages

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/ backend/drizzle.config.ts backend/drizzle/
git commit -m "feat: database schema — documents, chunks, chat with Drizzle ORM"
```

---

### Task 9: DeepSeek Service Layer

**Files:**
- Create: `notion-ai/backend/src/services/deepseek/client.ts`
- Create: `notion-ai/backend/src/services/deepseek/chat.ts`
- Create: `notion-ai/backend/src/services/deepseek/embedding.ts`
- Create: `notion-ai/backend/src/lib/prompts.ts`

- [ ] **Step 1: Write DeepSeek HTTP client**

```typescript
// src/services/deepseek/client.ts
import { env } from "../../env";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function deepseekChat(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; stream?: boolean }
): Promise<Response> {
  const res = await fetch(`${env.DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2048,
      stream: options?.stream ?? false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  return res;
}

export async function deepseekEmbed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${env.DEEPSEEK_BASE_URL}/v1/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-embed",
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek Embedding error ${res.status}: ${err}`);
  }

  const json = await res.json() as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}
```

- [ ] **Step 2: Write structured chat with JSON output**

```typescript
// src/services/deepseek/chat.ts
export async function structuredChat<T>(
  systemPrompt: string,
  userMessage: string
): Promise<T> {
  const res = await deepseekChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    { temperature: 0.1 }
  );

  const json = await res.json() as { choices: { message: { content: string } }[] };
  return JSON.parse(json.choices[0].message.content) as T;
}
```

- [ ] **Step 3: Write prompt templates**

```typescript
// src/lib/prompts.ts
export const RAG_SYSTEM_PROMPT = `You are an AI assistant for a knowledge base. Answer questions based on the provided context chunks. 

For each claim you make, cite the source using the format [chunk:CHUNK_ID]. Only use information from the provided context. If the context doesn't contain the answer, say "I couldn't find relevant information in the knowledge base."

Context:
{context}`;

export const CITATION_EXTRACTION_PROMPT = `Given the following AI response with citation markers like [chunk:UUID], extract the citations as a JSON array:

{response}

Return JSON format:
{"citations":[{"chunkId":"UUID","text":"the cited sentence"}]}`;

export const AI_WRITING_PROMPTS = {
  continue: "Continue writing from where the user left off. Match their tone and style.",
  rewrite: "Rewrite the following text to be more professional:",
  translate: "Translate the following text to {targetLang}:",
  summarize: "Summarize the following text in 2-3 sentences:",
};
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/deepseek/ backend/src/lib/prompts.ts
git commit -m "feat: DeepSeek service layer — chat, embedding, prompts"
```

---

### Task 10: Qdrant Service

**Files:**
- Create: `notion-ai/backend/src/services/qdrant.ts`

- [ ] **Step 1: Write Qdrant service**

```typescript
// src/services/qdrant.ts
import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../env";

export const qdrant = new QdrantClient({ url: env.QDRANT_URL });

const COLLECTION = "document_chunks";
const VECTOR_SIZE = 1536; // DeepSeek embedding dimension

export async function ensureCollection(): Promise<void> {
  const exists = (await qdrant.getCollections()).collections
    .find((c) => c.name === COLLECTION);

  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
  }
}

export async function upsertChunks(
  points: { id: string; vector: number[]; payload: Record<string, unknown> }[]
): Promise<void> {
  await qdrant.upsert(COLLECTION, { points });
}

export async function searchChunks(
  vector: number[],
  options: {
    limit?: number;
    filter?: { docId?: string };
  }
): Promise<{ id: string; score: number; payload: Record<string, unknown> }[]> {
  const filter = options.filter?.docId
    ? { must: [{ key: "docId", match: { value: options.filter.docId } }] }
    : undefined;

  const res = await qdrant.search(COLLECTION, {
    vector,
    limit: options.limit ?? 5,
    filter,
    with_payload: true,
  });

  return res.map((r) => ({
    id: r.id as string,
    score: r.score,
    payload: r.payload as Record<string, unknown>,
  }));
}

export async function deleteDocChunks(docId: string): Promise<void> {
  await qdrant.delete(COLLECTION, {
    filter: { must: [{ key: "docId", match: { value: docId } }] },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/qdrant.ts
git commit -m "feat: Qdrant service — collection management, upsert, search, delete"
```

---

### Task 11: Document CRUD Routes

**Files:**
- Create: `notion-ai/backend/src/routes/documents.ts`
- Create: `notion-ai/backend/test/routes/documents.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/routes/documents.test.ts
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { documentsRoute } from "../../src/routes/documents";

const app = new Hono().route("/api/documents", documentsRoute);

describe("Documents API", () => {
  it("POST /api/documents creates a document", async () => {
    const res = await app.request("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Doc" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; title: string };
    expect(body.id).toBeDefined();
    expect(body.title).toBe("Test Doc");
  });

  it("GET /api/documents returns documents list", async () => {
    const res = await app.request("/api/documents");
    expect(res.status).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test test/routes/documents.test.ts`
Expected: FAIL — route not found

- [ ] **Step 3: Write documents route**

```typescript
// src/routes/documents.ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/connection";
import { documents } from "../db/schema";
import { eq, isNull } from "drizzle-orm";

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
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return c.json({ error: "Not found" }, 404);
    const children = await db.select().from(documents).where(eq(documents.parentId, id));
    return c.json({ ...doc, children });
  })
  .patch("/:id", zValidator("json", z.object({ title: z.string().optional(), content: z.any().optional() })), async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const [doc] = await db.update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return c.json(doc);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(documents).where(eq(documents.id, id));
    return c.json({ success: true });
  });
```

- [ ] **Step 4: Mount routes in index.ts**

In `src/index.ts`, add:
```typescript
import { documentsRoute } from "./routes/documents";
app.route("/api/documents", documentsRoute);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && bun test test/routes/documents.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/documents.ts backend/src/index.ts backend/test/
git commit -m "feat: document CRUD API with tests"
```

---

### Task 12: File Upload & Ingestion Pipeline

**Files:**
- Create: `notion-ai/backend/src/routes/upload.ts`
- Create: `notion-ai/backend/src/services/ingestion/parser.ts`
- Create: `notion-ai/backend/src/services/ingestion/pipeline.ts`

- [ ] **Step 1: Write file parser**

```typescript
// src/services/ingestion/parser.ts
import mammoth from "mammoth";
// bun add mammoth pdf-parse

export type FileType = "pdf" | "docx" | "md" | "txt";

export interface ParsedDocument {
  text: string;
  sections: { heading: string; headingLevel: number; content: string; pageNumber: number | null }[];
  metadata: { sourceFile: string; fileType: FileType };
}

export async function parseFile(buffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "md" || ext === "txt") {
    const text = new TextDecoder().decode(buffer);
    return parsePlainText(text, fileName, ext as FileType);
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return parsePlainText(result.value, fileName, "docx");
  }

  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(Buffer.from(buffer));
    return parsePlainText(data.text, fileName, "pdf");
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

function parsePlainText(text: string, fileName: string, fileType: FileType): ParsedDocument {
  const lines = text.split("\n");
  const sections: ParsedDocument["sections"] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentContent = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (currentContent.trim()) {
        sections.push({ heading: currentHeading, headingLevel: currentLevel, content: currentContent.trim(), pageNumber: null });
      }
      currentHeading = headingMatch[2];
      currentLevel = headingMatch[1].length;
      currentContent = "";
    } else {
      currentContent += line + "\n";
    }
  }
  if (currentContent.trim()) {
    sections.push({ heading: currentHeading, headingLevel: currentLevel, content: currentContent.trim(), pageNumber: null });
  }

  return { text, sections, metadata: { sourceFile: fileName, fileType } };
}
```

- [ ] **Step 2: Write ingestion pipeline (stub — chunker and indexer come later)**

```typescript
// src/services/ingestion/pipeline.ts
import { parseFile } from "./parser";
import { db } from "../../db/connection";
import { documents } from "../../db/schema";

export async function ingestDocument(
  buffer: ArrayBuffer,
  fileName: string,
  docId: string
): Promise<{ chunkCount: number }> {
  const parsed = await parseFile(buffer, fileName);

  // Update doc metadata
  await db.update(documents)
    .set({ title: fileName.replace(/\.[^.]+$/, ""), updatedAt: new Date() })
    .where(eq(documents.id, docId));

  // For now, return parsed stats; chunking + indexing comes in Task 14-15
  return { chunkCount: parsed.sections.length };
}
```

- [ ] **Step 3: Write upload route**

```typescript
// src/routes/upload.ts
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

    // Create a document placeholder
    const [doc] = await db.insert(documents).values({
      title: file.name,
      parentId: parentId ?? null,
    }).returning();

    // Ingest in background (for MVP, do synchronously)
    const buffer = await file.arrayBuffer();
    const result = await ingestDocument(buffer, file.name, doc.id);

    return c.json({ docId: doc.id, ...result }, 201);
  });
```

- [ ] **Step 4: Mount upload route**

In `src/index.ts`, add:
```typescript
import { uploadRoute } from "./routes/upload";
app.route("/api/upload", uploadRoute);
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ingestion/ backend/src/routes/upload.ts backend/src/index.ts
git commit -m "feat: file upload endpoint with document parsing pipeline"
```

---

### Task 13: Chunking Engine

**Files:**
- Create: `notion-ai/backend/src/services/ingestion/chunker.ts`
- Create: `notion-ai/backend/test/services/chunker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/services/chunker.test.ts
import { describe, it, expect } from "bun:test";
import { chunkDocument, FixedSizeChunker, SemanticChunker } from "../../src/services/ingestion/chunker";

const SAMPLE_TEXT = `# Introduction
This is the first paragraph. It introduces the topic.
This is the second sentence in the intro.

# Chapter 1
This is chapter one content. It has more details about the topic.
More content here to fill out the chapter.

## Section 1.1
This is a subsection with specific information about the topic.
The subsection continues with more details.`;

describe("FixedSizeChunker", () => {
  it("chunks text by character count with overlap", () => {
    const chunks = FixedSizeChunker(SAMPLE_TEXT, { chunkSize: 100, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.length).toBeLessThanOrEqual(110); // chunkSize + margin
    // Check overlap: last words of chunk N should appear in chunk N+1
    const lastWords = chunks[0].text.slice(-20);
    expect(chunks[1].text).toContain(lastWords.trim().slice(-10));
  });

  it("preserves heading hierarchy in chunk metadata", () => {
    const chunks = FixedSizeChunker(SAMPLE_TEXT, { chunkSize: 200, overlap: 30 });
    const introChunk = chunks.find((c) => c.headingPath.includes("Introduction"));
    expect(introChunk).toBeDefined();
  });
});

describe("SemanticChunker", () => {
  it("splits on natural boundaries (headings, paragraphs)", () => {
    const chunks = SemanticChunker(SAMPLE_TEXT);
    // Should create chunks based on headings, not raw character count
    expect(chunks.length).toBeGreaterThanOrEqual(4); // at least 4 sections
    expect(chunks.some((c) => c.headingPath.includes("Section 1.1"))).toBe(true);
  });
});

describe("chunkDocument", () => {
  it("uses semantic chunker by default", () => {
    const chunks = chunkDocument(SAMPLE_TEXT, "semantic");
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.text).toBeTruthy();
      expect(chunk.chunkIndex).toBeGreaterThanOrEqual(0);
      expect(chunk.headingPath).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test test/services/chunker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write chunker implementation**

```typescript
// src/services/ingestion/chunker.ts
export interface Chunk {
  text: string;
  chunkIndex: number;
  headingPath: string[];
  charStart: number;
  charEnd: number;
}

export function FixedSizeChunker(
  text: string,
  opts: { chunkSize: number; overlap: number }
): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + opts.chunkSize, text.length);
    const chunkText = text.slice(start, end);
    const headingPath = extractHeadingPath(text, start);

    chunks.push({
      text: chunkText,
      chunkIndex: index++,
      headingPath,
      charStart: start,
      charEnd: end,
    });

    start = end - opts.overlap;
  }

  return chunks;
}

export function SemanticChunker(text: string): Chunk[] {
  // Split on heading boundaries
  const sections = text.split(/(?=^#{1,6}\s)/m);
  const chunks: Chunk[] = [];
  let charOffset = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section.trim()) continue;

    const headingMatch = section.match(/^(#{1,6})\s+(.+)/m);
    const headingPath = headingMatch
      ? [headingMatch[2].trim()]
      : [];

    // If section is very long, sub-chunk by paragraph
    if (section.length > 1000) {
      const paragraphs = section.split(/\n\n+/);
      for (const para of paragraphs) {
        if (!para.trim()) continue;
        chunks.push({
          text: para.trim(),
          chunkIndex: chunks.length,
          headingPath,
          charStart: charOffset,
          charEnd: charOffset + para.length,
        });
        charOffset += para.length;
      }
    } else {
      chunks.push({
        text: section.trim(),
        chunkIndex: chunks.length,
        headingPath,
        charStart: charOffset,
        charEnd: charOffset + section.length,
      });
      charOffset += section.length;
    }
  }

  return chunks;
}

export function chunkDocument(
  text: string,
  strategy: "fixed" | "semantic" | "recursive" = "semantic",
  opts?: { chunkSize?: number; overlap?: number }
): Chunk[] {
  switch (strategy) {
    case "fixed":
      return FixedSizeChunker(text, { chunkSize: opts?.chunkSize ?? 500, overlap: opts?.overlap ?? 50 });
    case "semantic":
      return SemanticChunker(text);
    case "recursive":
      // Use semantic first, then fixed-size for remaining large chunks
      const semantic = SemanticChunker(text);
      return semantic.flatMap((c) =>
        c.text.length > 1000
          ? FixedSizeChunker(c.text, { chunkSize: 500, overlap: 50 }).map((fc) => ({
              ...fc,
              headingPath: [...c.headingPath, ...fc.headingPath],
            }))
          : [c]
      );
  }
}

function extractHeadingPath(text: string, position: number): string[] {
  const beforeText = text.slice(0, position);
  const headings: string[] = [];
  const matches = beforeText.matchAll(/^(#{1,6})\s+(.+)/gm);
  for (const m of matches) {
    const level = m[1].length;
    headings.length = level - 1;
    headings[level - 1] = m[2].trim();
  }
  return headings.filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test test/services/chunker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ingestion/chunker.ts backend/test/services/chunker.test.ts
git commit -m "feat: chunking engine — fixed-size, semantic, recursive strategies with tests"
```

---

### Task 14: Embedding & Indexer Service

**Files:**
- Create: `notion-ai/backend/src/services/ingestion/indexer.ts`

- [ ] **Step 1: Write embedding + Qdrant indexer**

```typescript
// src/services/ingestion/indexer.ts
import { deepseekEmbed } from "../deepseek/client";
import { qdrant, upsertChunks, ensureCollection, deleteDocChunks } from "../qdrant";
import { db } from "../../db/connection";
import { chunks, documents } from "../../db/schema";
import type { Chunk } from "./chunker";

const BATCH_SIZE = 20; // DeepSeek embedding batch limit

export async function indexChunks(docId: string, textChunks: Chunk[]): Promise<void> {
  await ensureCollection();

  // Delete existing chunks for this doc
  await deleteDocChunks(docId);

  // Process in batches
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

    // Update chunk rows with Qdrant point ID
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
```

- [ ] **Step 2: Wire indexer into pipeline**

Update `src/services/ingestion/pipeline.ts` to call `indexChunks` after parsing.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/ingestion/indexer.ts backend/src/services/ingestion/pipeline.ts
git commit -m "feat: embedding + Qdrant indexer with batch processing"
```

---

### Task 15: RAG Engine — Retriever + Generator

**Files:**
- Create: `notion-ai/backend/src/services/rag/retriever.ts`
- Create: `notion-ai/backend/src/services/rag/generator.ts`
- Create: `notion-ai/backend/src/services/rag/engine.ts`
- Create: `notion-ai/backend/src/lib/citation.ts`
- Create: `notion-ai/backend/test/services/retriever.test.ts`
- Create: `notion-ai/backend/test/services/generator.test.ts`

- [ ] **Step 1: Write retriever**

```typescript
// src/services/rag/retriever.ts
import { deepseekEmbed } from "../deepseek/client";
import { searchChunks } from "../qdrant";

export interface RetrievedChunk {
  chunkId: string;
  docId: string;
  docTitle: string;
  text: string;
  score: number;
  headingPath: string[];
}

export async function retrieve(
  query: string,
  options?: { docId?: string; topK?: number }
): Promise<RetrievedChunk[]> {
  const queryVector = (await deepseekEmbed([query]))[0];
  const results = await searchChunks(queryVector, {
    limit: options?.topK ?? 5,
    filter: options?.docId ? { docId: options.docId } : undefined,
  });

  return results.map((r) => ({
    chunkId: r.id,
    docId: r.payload.docId as string,
    docTitle: (r.payload.docTitle as string) ?? "Unknown",
    text: r.payload.text as string,
    score: r.score,
    headingPath: (r.payload.headingPath as string[]) ?? [],
  }));
}
```

- [ ] **Step 2: Write citation extractor**

```typescript
// src/lib/citation.ts
export interface Citation {
  chunkId: string;
  text: string;
}

export function extractCitations(response: string, chunks: { chunkId: string; text: string }[]): Citation[] {
  const citations: Citation[] = [];
  const regex = /\[chunk:([a-f0-9-]+)\]/gi;
  let match;

  while ((match = regex.exec(response)) !== null) {
    const chunkId = match[1];
    const chunk = chunks.find((c) => c.chunkId === chunkId);
    if (chunk) {
      citations.push({ chunkId: chunk.chunkId, text: chunk.text.slice(0, 200) });
    }
  }

  return citations;
}
```

- [ ] **Step 3: Write generator**

```typescript
// src/services/rag/generator.ts
import { deepseekChat } from "../deepseek/client";
import { RAG_SYSTEM_PROMPT } from "../../lib/prompts";
import { extractCitations } from "../../lib/citation";
import type { RetrievedChunk } from "./retriever";

export interface RAGResponse {
  answer: string;
  citations: { chunkId: string; text: string }[];
}

export async function generate(
  query: string,
  retrievedChunks: RetrievedChunk[]
): Promise<ReadableStream> {
  // Build context from retrieved chunks
  const context = retrievedChunks
    .map((c, i) => `[chunk:${c.chunkId}]\nSource: ${c.docTitle}\nSection: ${c.headingPath.join(" > ")}\n${c.text}`)
    .join("\n\n");

  const systemPrompt = RAG_SYSTEM_PROMPT.replace("{context}", context);

  const res = await deepseekChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    { stream: true, temperature: 0.3 }
  );

  return res.body!;
}

export async function generateSync(
  query: string,
  retrievedChunks: RetrievedChunk[]
): Promise<RAGResponse> {
  const context = retrievedChunks
    .map((c, i) => `[chunk:${c.chunkId}]\nSource: ${c.docTitle}\n${c.text}`)
    .join("\n\n");

  const systemPrompt = RAG_SYSTEM_PROMPT.replace("{context}", context);

  const res = await deepseekChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    { stream: false, temperature: 0.3 }
  );

  const json = await res.json() as { choices: { message: { content: string } }[] };
  const answer = json.choices[0].message.content;

  const citations = extractCitations(answer, retrievedChunks);

  return { answer, citations };
}
```

- [ ] **Step 4: Write RAG engine orchestrator**

```typescript
// src/services/rag/engine.ts
import { retrieve } from "./retriever";
import { generate, generateSync } from "./generator";

export async function ragQuery(
  query: string,
  options?: { docId?: string; topK?: number }
): Promise<ReadableStream> {
  const chunks = await retrieve(query, options);
  return generate(query, chunks);
}

export async function ragQuerySync(
  query: string,
  options?: { docId?: string; topK?: number }
) {
  const chunks = await retrieve(query, options);
  return generateSync(query, chunks);
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/rag/ backend/src/lib/citation.ts
git commit -m "feat: RAG engine — retriever, generator with citations, streaming"
```

---

### Task 16: AI Chat Route (SSE Streaming)

**Files:**
- Create: `notion-ai/backend/src/routes/chat.ts`

- [ ] **Step 1: Write chat route with SSE streaming**

```typescript
// src/routes/chat.ts
import { Hono } from "hono";
import { ragQuery } from "../services/rag/engine";
import { db } from "../db/connection";
import { chatSessions, chatMessages } from "../db/schema";
import { eq } from "drizzle-orm";

export const chatRoute = new Hono()
  .post("/", async (c) => {
    const { message, docId, sessionId } = await c.req.json() as {
      message: string;
      docId?: string;
      sessionId?: string;
    };

    // Create or get session
    let sid = sessionId;
    if (!sid) {
      const [session] = await db.insert(chatSessions).values({
        docId: docId ?? null,
        title: message.slice(0, 100),
      }).returning();
      sid = session.id;
    }

    // Save user message
    await db.insert(chatMessages).values({
      sessionId: sid,
      role: "user",
      content: message,
    });

    // Get RAG stream
    const stream = await ragQuery(message, { docId });

    // Stream response back
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  })
  .get("/sessions/:docId", async (c) => {
    const docId = c.req.param("docId");
    const sessions = await db.select()
      .from(chatSessions)
      .where(eq(chatSessions.docId, docId))
      .orderBy(chatSessions.createdAt);
    return c.json(sessions);
  })
  .get("/messages/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const messages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);
    return c.json(messages);
  });
```

- [ ] **Step 2: Mount chat route**

In `src/index.ts`, add:
```typescript
import { chatRoute } from "./routes/chat";
app.route("/api/chat", chatRoute);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/chat.ts backend/src/index.ts
git commit -m "feat: AI chat route with SSE streaming, session management"
```

---

### Task 17: Search Route

**Files:**
- Create: `notion-ai/backend/src/routes/search.ts`

- [ ] **Step 1: Write search route**

```typescript
// src/routes/search.ts
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
```

- [ ] **Step 2: Mount search route**

In `src/index.ts`, add:
```typescript
import { searchRoute } from "./routes/search";
app.route("/api/search", searchRoute);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/search.ts backend/src/index.ts
git commit -m "feat: hybrid search route with vector retrieval"
```

---

## Phase 3: Frontend MVP (Weeks 4-6)

### Task 18: Layout Shell — Sidebar + Main Area

**Files:**
- Create: `notion-ai/frontend/src/app/(main)/layout.tsx`
- Create: `notion-ai/frontend/src/app/layout.tsx` (update)
- Create: `notion-ai/frontend/src/app/(main)/page.tsx`
- Create: `notion-ai/frontend/src/components/sidebar/doc-tree.tsx`
- Create: `notion-ai/frontend/src/components/sidebar/doc-tree-item.tsx`
- Create: `notion-ai/frontend/src/components/sidebar/new-doc-button.tsx`

- [ ] **Step 1: Write root layout with providers**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Notion AI — Knowledge Base",
  description: "AI-powered knowledge management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Write main layout (sidebar + content)**

```tsx
// src/app/(main)/layout.tsx
"use client";
import { useState } from "react";
import { DocTree } from "@/components/sidebar/doc-tree";
import { NewDocButton } from "@/components/sidebar/new-doc-button";
import { useRouter } from "next/navigation";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <aside className="w-64 border-r bg-zinc-50 flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between">
          <h1 className="font-semibold text-sm">Knowledge Base</h1>
          <NewDocButton />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <DocTree />
        </div>
      </aside>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Write DocTree with recursive rendering**

```tsx
// src/components/sidebar/doc-tree.tsx
"use client";
import { useEffect, useState } from "react";
import { DocTreeItem } from "./doc-tree-item";
import type { Doc } from "@/types";
import { apiClient } from "@/lib/api-client";

export function DocTree() {
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    apiClient.get("/documents").then(setDocs);
  }, []);

  const refresh = () => apiClient.get("/documents").then(setDocs);

  return (
    <div className="space-y-0.5">
      {docs.map((doc) => (
        <DocTreeItem key={doc.id} doc={doc} level={0} onUpdate={refresh} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write DocTreeItem**

```tsx
// src/components/sidebar/doc-tree-item.tsx
"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Doc } from "@/types";
import { cn } from "@/lib/utils";
import { ChevronRight, FileText } from "lucide-react";

export function DocTreeItem({ doc, level, onUpdate }: { doc: Doc; level: number; onUpdate: () => void }) {
  const params = useParams();
  const isActive = params.docId === doc.id;

  return (
    <>
      <Link
        href={`/${doc.id}`}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-sm hover:bg-zinc-200 transition-colors",
          isActive && "bg-zinc-200 font-medium",
        )}
        style={{ paddingLeft: `${8 + level * 12}px` }}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="truncate">{doc.title || "Untitled"}</span>
      </Link>
      {"children" in doc && (doc as any).children?.map((child: Doc) => (
        <DocTreeItem key={child.id} doc={child} level={level + 1} onUpdate={onUpdate} />
      ))}
    </>
  );
}
```

- [ ] **Step 5: Write NewDocButton**

```tsx
// src/components/sidebar/new-doc-button.tsx
"use client";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NewDocButton() {
  const router = useRouter();

  const createDoc = async () => {
    const res = await apiClient.post("/documents", { title: "Untitled" });
    const doc = await res.json() as { id: string };
    router.push(`/${doc.id}`);
  };

  return (
    <Button variant="ghost" size="icon" onClick={createDoc}>
      <Plus className="h-4 w-4" />
    </Button>
  );
}
```

- [ ] **Step 6: Write home page**

```tsx
// src/app/(main)/page.tsx
export default function HomePage() {
  return (
    <div className="flex items-center justify-center h-full text-zinc-400">
      Select a document or create a new one
    </div>
  );
}
```

- [ ] **Step 7: Write API client**

```typescript
// src/lib/api-client.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const apiClient = {
  get: (path: string) => fetch(`${BASE_URL}/api${path}`).then((r) => r.json()),
  post: (path: string, body: unknown) =>
    fetch(`${BASE_URL}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  patch: (path: string, body: unknown) =>
    fetch(`${BASE_URL}/api${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  delete: (path: string) =>
    fetch(`${BASE_URL}/api${path}`, { method: "DELETE" }),
};
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/app/(main)/ frontend/src/components/sidebar/ frontend/src/lib/api-client.ts
git commit -m "feat: layout shell — sidebar with doc tree, API client"
```

---

### Task 19: TipTap Editor Integration

**Files:**
- Create: `notion-ai/frontend/src/components/editor/tip-tap-editor.tsx`
- Create: `notion-ai/frontend/src/components/editor/editor-toolbar.tsx`
- Create: `notion-ai/frontend/src/app/(main)/[docId]/page.tsx`
- Create: `notion-ai/frontend/src/hooks/use-debounce.ts`

- [ ] **Step 1: Write useDebounce hook**

```typescript
// src/hooks/use-debounce.ts
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

- [ ] **Step 2: Write TipTap editor**

```tsx
// src/components/editor/tip-tap-editor.tsx
"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { EditorToolbar } from "./editor-toolbar";
import { useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { apiClient } from "@/lib/api-client";

interface TipTapEditorProps {
  docId: string;
  initialContent: object;
  onTitleChange: (title: string) => void;
}

export function TipTapEditor({ docId, initialContent, onTitleChange }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Type / for commands..." }),
      Highlight,
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: "prose prose-zinc max-w-none focus:outline-none min-h-[200px] px-8 py-4" },
    },
  });

  const content = editor?.getJSON();
  const debouncedContent = useDebounce(content, 1000);

  // Auto-save on debounced content change
  useEffect(() => {
    if (debouncedContent && Object.keys(debouncedContent).length > 0) {
      apiClient.patch(`/documents/${docId}`, { content: debouncedContent });
    }
  }, [debouncedContent, docId]);

  // Update editor when docId changes (navigation)
  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [docId]);

  return (
    <div className="flex flex-col h-full">
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="max-w-3xl mx-auto" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write editor toolbar**

```tsx
// src/components/editor/editor-toolbar.tsx
"use client";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered, Heading2, Code, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";

const tools = [
  { icon: Bold, action: (e: Editor) => e.chain().focus().toggleBold().run(), active: "bold" },
  { icon: Italic, action: (e: Editor) => e.chain().focus().toggleItalic().run(), active: "italic" },
  { icon: Strikethrough, action: (e: Editor) => e.chain().focus().toggleStrike().run(), active: "strike" },
  { icon: Heading2, action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: "heading" },
  { icon: List, action: (e: Editor) => e.chain().focus().toggleBulletList().run(), active: "bulletList" },
  { icon: ListOrdered, action: (e: Editor) => e.chain().focus().toggleOrderedList().run(), active: "orderedList" },
  { icon: Code, action: (e: Editor) => e.chain().focus().toggleCodeBlock().run(), active: "codeBlock" },
];

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b bg-white sticky top-0 z-10">
      {tools.map((tool) => (
        <Button
          key={tool.active}
          variant={editor.isActive(tool.active) ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => tool.action(editor)}
        >
          <tool.icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write document editor page**

```tsx
// src/app/(main)/[docId]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TipTapEditor } from "@/components/editor/tip-tap-editor";
import { ChatPanel } from "@/components/chat/chat-panel";
import { apiClient } from "@/lib/api-client";
import { Doc } from "@/types";

export default function DocPage() {
  const params = useParams();
  const docId = params.docId as string;
  const [doc, setDoc] = useState<Doc | null>(null);

  useEffect(() => {
    apiClient.get(`/documents/${docId}`).then(setDoc);
  }, [docId]);

  if (!doc) return <div className="p-8 text-zinc-400">Loading...</div>;

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-8 py-4 border-b">
          <input
            type="text"
            value={doc.title}
            onChange={(e) => {
              setDoc({ ...doc, title: e.target.value });
              apiClient.patch(`/documents/${docId}`, { title: e.target.value });
            }}
            className="text-2xl font-bold bg-transparent border-none outline-none w-full"
            placeholder="Untitled"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <TipTapEditor docId={docId} initialContent={doc.content} onTitleChange={(t) => setDoc({ ...doc, title: t })} />
        </div>
      </div>
      <ChatPanel docId={docId} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/editor/ frontend/src/app/\(main\)/\[docId\]/ frontend/src/hooks/use-debounce.ts
git commit -m "feat: TipTap editor with auto-save, toolbar, document page layout"
```

---

### Task 20: AI Chat Panel with Streaming

**Files:**
- Create: `notion-ai/frontend/src/components/chat/chat-panel.tsx`
- Create: `notion-ai/frontend/src/components/chat/chat-message.tsx`
- Create: `notion-ai/frontend/src/components/chat/citation-link.tsx`
- Create: `notion-ai/frontend/src/hooks/use-streaming-chat.ts`

- [ ] **Step 1: Write useStreamingChat hook**

```typescript
// src/hooks/use-streaming-chat.ts
import { useState, useCallback } from "react";
import type { ChatMessage } from "@/types";

export function useStreamingChat(docId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      citations: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content, docId }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const chunk = JSON.parse(data) as { choices: { delta: { content: string } }[] };
            const delta = chunk.choices[0]?.delta?.content ?? "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m
              )
            );
          } catch {}
        }
      }
    }

    setIsStreaming(false);
  }, [docId]);

  return { messages, isStreaming, sendMessage };
}
```

- [ ] **Step 2: Write ChatPanel**

```tsx
// src/components/chat/chat-panel.tsx
"use client";
import { useState } from "react";
import { useStreamingChat } from "@/hooks/use-streaming-chat";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

export function ChatPanel({ docId }: { docId: string }) {
  const { messages, isStreaming, sendMessage } = useStreamingChat(docId);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="w-80 border-l flex flex-col h-full bg-white">
      <div className="p-3 border-b font-medium text-sm">AI Chat</div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-zinc-400 text-center mt-8">
            Ask questions about this document
          </p>
        )}
      </div>
      <div className="p-3 border-t flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask about this doc..."
          className="flex-1 px-3 py-1.5 text-sm border rounded-md"
          disabled={isStreaming}
        />
        <Button size="icon" onClick={handleSend} disabled={isStreaming}>
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write ChatMessage with citation support**

```tsx
// src/components/chat/chat-message.tsx
import { CitationLink } from "./citation-link";
import type { ChatMessage as ChatMessageType } from "@/types";

export function ChatMessage({ message }: { message: ChatMessageType }) {
  return (
    <div className={`${message.role === "user" ? "text-right" : ""}`}>
      <div className={`inline-block rounded-lg px-3 py-2 text-sm max-w-full ${
        message.role === "user"
          ? "bg-blue-500 text-white"
          : "bg-zinc-100 text-zinc-900"
      }`}>
        <p className="whitespace-pre-wrap">{message.content || "..."}</p>
      </div>
      {message.citations.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {message.citations.map((c, i) => (
            <CitationLink key={i} citation={c} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write CitationLink**

```tsx
// src/components/chat/citation-link.tsx
import type { Citation } from "@/types";

export function CitationLink({ citation }: { citation: Citation }) {
  return (
    <button
      className="text-xs text-blue-600 hover:underline block"
      onClick={() => {
        // Scroll to the cited chunk in the document
        // (implementation depends on how chunks map to editor positions)
      }}
    >
      {citation.docTitle} — {citation.text.slice(0, 80)}...
    </button>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ frontend/src/hooks/use-streaming-chat.ts
git commit -m "feat: AI chat panel with SSE streaming and citation display"
```

---

### Task 21: Hybrid Search UI

**Files:**
- Create: `notion-ai/frontend/src/components/search/search-dialog.tsx`
- Create: `notion-ai/frontend/src/components/search/search-result-item.tsx`

- [ ] **Step 1: Write SearchDialog**

```tsx
// src/components/search/search-dialog.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
import { SearchResultItem } from "./search-result-item";
import { useDebounce } from "@/hooks/use-debounce";
import { SearchResult } from "@/types";

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const debouncedQuery = useDebounce(query, 300);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then(setResults);
  }, [debouncedQuery]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search documents..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Documents">
          {results.map((r) => (
            <SearchResultItem
              key={r.chunkId}
              result={r}
              onSelect={() => {
                router.push(`/${r.docId}`);
                setOpen(false);
              }}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 2: Write SearchResultItem**

```tsx
// src/components/search/search-result-item.tsx
import { CommandItem } from "@/components/ui/command";
import type { SearchResult } from "@/types";
import { FileText } from "lucide-react";

export function SearchResultItem({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: () => void;
}) {
  return (
    <CommandItem onSelect={onSelect} className="flex items-start gap-2 py-2">
      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-zinc-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.docTitle}</p>
        <p className="text-xs text-zinc-500 line-clamp-2">{result.text}</p>
      </div>
      <span className="text-xs text-zinc-400">{Math.round(result.score * 100)}%</span>
    </CommandItem>
  );
}
```

- [ ] **Step 3: Add SearchDialog to layout**

Update `src/app/(main)/layout.tsx` to include `<SearchDialog />`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/search/ frontend/src/app/\(main\)/layout.tsx
git commit -m "feat: hybrid search UI with ⌘K command palette"
```

---

### Task 22: File Upload Dialog

**Files:**
- Create: `notion-ai/frontend/src/components/upload/upload-dialog.tsx`

- [ ] **Step 1: Write UploadDialog**

```tsx
// src/components/upload/upload-dialog.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });
    const { docId } = await res.json() as { docId: string };

    setUploading(false);
    setOpen(false);
    router.push(`/${docId}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-8">
          {uploading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processing document...</span>
            </div>
          ) : (
            <label className="flex flex-col items-center gap-2 cursor-pointer p-8 border-2 border-dashed rounded-lg hover:border-blue-400 transition-colors">
              <Upload className="h-8 w-8 text-zinc-400" />
              <span className="text-sm text-zinc-500">PDF, Word, Markdown, TXT</span>
              <input type="file" className="hidden" accept=".pdf,.docx,.md,.txt" onChange={handleUpload} />
            </label>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add UploadDialog to sidebar**

Update sidebar layout to include `<UploadDialog />`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/upload/ frontend/src/app/\(main\)/layout.tsx
git commit -m "feat: file upload dialog — PDF, Word, Markdown ingestion"
```

---

## Phase 4: Advanced Features (Weeks 7-8)

### Task 23: Smart Chunking Improvements

**Files:**
- Modify: `notion-ai/backend/src/services/ingestion/chunker.ts`
- Modify: `notion-ai/backend/test/services/chunker.test.ts`

- [ ] **Step 1: Add recursive chunker with heading-aware splitting**

Add `RecursiveChunker` function that prefers splitting on headings, then paragraphs, then sentences, then characters.

Add tests for:
- Already covered by the existing recursive strategy in Task 13, but enhance:
- Ensure heading hierarchy is preserved across sub-chunks
- Test with documents that have deeply nested headings (h1 > h2 > h3)

- [ ] **Step 2: Add sliding window overlap with heading continuity**

Ensure overlap between chunks maintains heading context. When chunk N+1 overlaps with chunk N, it inherits the heading path from the overlapping section.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/ingestion/chunker.ts backend/test/services/chunker.test.ts
git commit -m "feat: improved smart chunking — recursive splitting, heading continuity"
```

---

### Task 24: Citation Feedback Loop

**Files:**
- Create: `notion-ai/backend/src/routes/feedback.ts`

- [ ] **Step 1: Write feedback route**

```typescript
// src/routes/feedback.ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/connection";
import { chatMessages } from "../db/schema";
import { eq } from "drizzle-orm";

export const feedbackRoute = new Hono()
  .post("/", zValidator("json", z.object({
    messageId: z.string(),
    rating: z.enum(["up", "down"]),
    comment: z.string().optional(),
  })), async (c) => {
    const { messageId, rating, comment } = c.req.valid("json");

    // Update the message feedback in chat_messages table
    // (requires feedback columns added to schema: rating text, feedback_comment text)
    await db.update(chatMessages)
      .set({ rating, feedbackComment: comment ?? null } as any)
      .where(eq(chatMessages.id, messageId));

    // If downvote, log the bad response for analysis
    if (rating === "down") {
      const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
      // Store for future RAG quality improvement analysis
      console.log(`[FEEDBACK] Downvote on message ${messageId}: ${comment ?? "no comment"}`);
    }

    return c.json({ success: true });
  });
```

- [ ] **Step 2: Add feedback buttons to ChatMessage UI**

Update `chat-message.tsx` to show 👍👎 buttons and call the feedback endpoint.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/feedback.ts frontend/src/components/chat/chat-message.tsx
git commit -m "feat: citation feedback loop — upvote/downvote on AI responses"
```

---

### Task 25: RAGAS Evaluation Setup

**Files:**
- Create: `notion-ai/backend/src/services/eval/evaluator.ts`
- Create: `notion-ai/backend/test/services/evaluator.test.ts`

- [ ] **Step 1: Write basic evaluator**

```typescript
// src/services/eval/evaluator.ts
import { ragQuerySync } from "../rag/engine";

interface EvalCase {
  query: string;
  expectedAnswer: string;
}

interface EvalResult {
  query: string;
  actualAnswer: string;
  citations: { chunkId: string; text: string }[];
  faithfulness: number;  // 0-1: does answer stick to retrieved context?
  relevance: number;     // 0-1: does answer address the query?
  latencyMs: number;
  tokensUsed: number;
}

export async function runEval(cases: EvalCase[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const tc of cases) {
    const start = Date.now();
    const res = await ragQuerySync(tc.query);
    const latency = Date.now() - start;

    // Simple heuristic scoring (can be enhanced with LLM-as-judge)
    const faithfulness = res.citations.length > 0 ? 0.8 : 0.3;
    const relevance = res.answer.toLowerCase().includes(tc.query.toLowerCase().slice(0, 10)) ? 0.7 : 0.3;

    results.push({
      query: tc.query,
      actualAnswer: res.answer,
      citations: res.citations,
      faithfulness,
      relevance,
      latencyMs: latency,
      tokensUsed: res.answer.length / 4, // rough estimate
    });
  }

  return results;
}

export function summary(results: EvalResult[]): string {
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return `
    Eval Summary (${results.length} cases):
    - Avg Faithfulness: ${avg(results.map((r) => r.faithfulness)).toFixed(2)}
    - Avg Relevance: ${avg(results.map((r) => r.relevance)).toFixed(2)}
    - Avg Latency: ${avg(results.map((r) => r.latencyMs)).toFixed(0)}ms
    - Total Tokens: ${results.reduce((s, r) => s + r.tokensUsed, 0)}
  `;
}
```

- [ ] **Step 2: Write test with 5 eval cases**

Create 5 test documents and 5 Q&A pairs, run eval, assert faithfulness > 0.5 for all.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/eval/ backend/test/services/evaluator.test.ts
git commit -m "feat: RAG eval framework — faithfulness, relevance, latency metrics"
```

---

### Task 26: AI-Assisted Writing Menu

**Files:**
- Create: `notion-ai/frontend/src/components/editor/ai-writing-menu.tsx`

- [ ] **Step 1: Write AI writing floating menu**

```tsx
// src/components/editor/ai-writing-menu.tsx
"use client";
import { useState } from "react";
import { Sparkles, Languages, ListRestart, FileText } from "lucide-react";

const AI_ACTIONS = [
  { id: "continue", label: "Continue writing", icon: Sparkles },
  { id: "rewrite", label: "Rewrite professionally", icon: ListRestart },
  { id: "translate-zh", label: "Translate to Chinese", icon: Languages },
  { id: "translate-en", label: "Translate to English", icon: Languages },
  { id: "summarize", label: "Summarize", icon: FileText },
] as const;

export function AIWritingMenu({
  selectedText,
  onReplace,
  onClose,
}: {
  selectedText: string;
  onReplace: (text: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: string) => {
    setLoading(action);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[${action}] ${selectedText}`,
      }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") {
          try {
            const chunk = JSON.parse(line.slice(6)) as { choices: { delta: { content: string } }[] };
            result += chunk.choices[0]?.delta?.content ?? "";
          } catch {}
        }
      }
    }
    onClose();
  };

  return (
    <div className="absolute z-50 bg-white rounded-lg shadow-lg border p-1 min-w-[200px]">
      {AI_ACTIONS.map((action) => (
        <button
          key={action.id}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-zinc-100 rounded"
          onClick={() => handleAction(action.id)}
          disabled={loading === action.id}
        >
          <action.icon className="h-4 w-4" />
          {action.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Integrate AI menu into TipTap editor**

Add a selection handler in `tip-tap-editor.tsx` that shows the AI menu when text is selected.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/editor/ai-writing-menu.tsx frontend/src/components/editor/tip-tap-editor.tsx
git commit -m "feat: AI-assisted writing menu — continue, rewrite, translate, summarize"
```

---

## Phase 5: Polish & Integration (Week 9)

### Task 27: End-to-End Integration Testing

**Files:**
- Create: `notion-ai/backend/test/integration/rag-flow.test.ts`

- [ ] **Step 1: Write integration test**

Test the full flow: upload a Markdown file → parse → chunk → embed → search → chat.
Use actual Docker services (postgres, qdrant). Mark as integration test with `test.todo` if services unavailable.

- [ ] **Step 2: Run test**

Run: `cd backend && bun test test/integration/rag-flow.test.ts`

- [ ] **Step 3: Commit**

```bash
git add backend/test/integration/
git commit -m "test: end-to-end RAG pipeline integration test"
```

---

### Task 28: Frontend Polish — Loading States & Error Handling

**Files:**
- Modify: Various frontend components

- [ ] **Step 1: Add loading skeletons**
  - Document tree: skeleton list while loading
  - Editor: skeleton block while loading document
  - Chat: loading dots while streaming

- [ ] **Step 2: Add error boundaries and toast notifications**
  - API errors show toast via shadcn/ui Sonner
  - Editor auto-save failures show retry toast

- [ ] **Step 3: Add empty states**
  - No documents: prompt to create first doc or upload
  - Empty search: suggest different keywords

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: polish — loading states, error handling, empty states"
```

---

### Task 29: README & Documentation

**Files:**
- Create: `notion-ai/README.md`

- [ ] **Step 1: Write comprehensive README**

Include: project description, architecture diagram (ASCII), setup instructions, environment variables, API endpoints, learning notes reference.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup guide and architecture"
```

---

### Task 30: Final Review & Knowledge Base Write-up

**Files:**
- Create: `notion-ai/learning/05-project1-retrospective.md`

- [ ] **Step 1: Write project retrospective**

Cover:
- What worked well / what didn't
- Key technical decisions and why
- RAG performance numbers (eval results)
- Biggest learnings
- What to improve for Project 2

- [ ] **Step 2: Commit**

```bash
git add learning/05-project1-retrospective.md
git commit -m "learn: project 1 retrospective — RAG platform lessons learned"
```

---

## Summary

| Phase | Tasks | Scope |
|-------|-------|-------|
| Phase 0 | 1-3 | Environment setup, scaffold frontend + backend |
| Phase 1 | 4-7 | Structured learning (RAG, DeepSeek API, Qdrant, doc parsing) |
| Phase 2 | 8-17 | Backend core — DB, DeepSeek service, Qdrant, CRUD, ingestion, chunking, indexing, RAG engine, chat, search |
| Phase 3 | 18-22 | Frontend MVP — sidebar, editor, chat panel, search UI, upload |
| Phase 4 | 23-26 | Advanced — smart chunking, feedback loop, RAGAS eval, AI writing |
| Phase 5 | 27-30 | Integration test, polish, docs, retrospective |

**Total: 30 tasks** across 5 phases. Estimated 7 weeks at 6-8 hrs/week: ~2 weeks learning + ~4 weeks coding MVP + ~1 week advanced.

# Notion AI — AI-Powered Knowledge Platform

A Notion-like knowledge management platform with AI-powered chat, hybrid search, and document ingestion pipeline. Built as Project 1 of the AI Fullstack learning roadmap.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ TipTap   │ │ Chat     │ │ Search   │ │ Upload    │  │
│  │ Editor   │ │ Panel    │ │ Dialog   │ │ Dialog    │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       │            │            │              │         │
│       ▼            ▼            ▼              ▼         │
│              REST API + SSE Streaming                    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                 Backend (Bun + Hono)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Documents│ │ Ingestion│ │ RAG      │ │ Search    │  │
│  │ CRUD     │ │ Pipeline │ │ Engine   │ │           │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       │            │            │              │         │
│       ▼            ▼            ▼              ▼         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │PostgreSQL│ │ Qdrant   │ │ DeepSeek │                 │
│  │(pgvector)│ │ VectorDB │ │ API      │                 │
│  └──────────┘ └──────────┘ └──────────┘                 │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | Next.js 16, React 19, TipTap, TailwindCSS 4, shadcn/ui |
| Backend  | Bun, Hono, Zod, Drizzle ORM         |
| Database | PostgreSQL + pgvector               |
| Search   | Qdrant vector database              |
| AI       | DeepSeek API (chat + embeddings)    |
| Storage  | MinIO (S3-compatible)               |
| Infra    | Docker Compose                      |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- [Docker](https://docs.docker.com/get-docker/)
- [DeepSeek API key](https://platform.deepseek.com/)

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** (pgvector) on `:5432` — user: `notion`, pass: `notionpass`, db: `notion_ai`
- **Qdrant** on `:6334` (gRPC) and `:6333` (HTTP)
- **MinIO** on `:9000` (API) and `:9001` (Console) — access key / secret: `minioadmin`

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your DeepSeek API key:

```
DEEPSEEK_API_KEY=sk-your-actual-key
```

### 3. Run Database Migrations

```bash
cd backend
bun install
bun run db:generate
bun run db:migrate
```

### 4. Start Backend

```bash
cd backend
bun run dev
```

Server starts at `http://localhost:3001`.

### 5. Start Frontend

```bash
cd frontend
bun install
bun run dev
```

Open `http://localhost:3000`.

## API Endpoints

### Documents

| Method | Path                 | Description              |
|--------|----------------------|--------------------------|
| GET    | /api/documents       | List root documents      |
| POST   | /api/documents       | Create document          |
| GET    | /api/documents/:id   | Get document with children |
| PATCH  | /api/documents/:id   | Update document          |
| DELETE | /api/documents/:id   | Delete document          |

### Upload

| Method | Path          | Description                    |
|--------|---------------|--------------------------------|
| POST   | /api/upload   | Upload file (multipart), triggers ingestion pipeline |

### Chat

| Method | Path                    | Description                  |
|--------|-------------------------|------------------------------|
| POST   | /api/chat               | Send message (SSE stream), auto-creates session |
| GET    | /api/chat/sessions/:docId | List chat sessions for doc |
| GET    | /api/chat/messages/:sessionId | Get messages for session |

### Search

| Method | Path          | Description              |
|--------|---------------|--------------------------|
| GET    | /api/search?q=&docId= | Hybrid search across documents |

### Feedback

| Method | Path           | Description              |
|--------|----------------|--------------------------|
| POST   | /api/feedback  | Submit up/down feedback on AI response |

### Health

| Method | Path         | Description |
|--------|--------------|-------------|
| GET    | /api/health  | Health check |

## RAG Pipeline

The ingestion pipeline processes uploaded documents through these stages:

```
File Upload → Parse → Chunk → Embed → Index
   (PDF/     (text   (3       (DeepSeek (Qdrant +
    DOCX/MD)  extract) strategies) embed)   Postgres)
```

**Chunking strategies:**
- `fixed` — Fixed-size with overlap
- `semantic` — Splits on heading/paragraph boundaries (default)
- `recursive` — Recursive separator fallback for long text

**Query flow:**
```
User Query → Embed → Qdrant Search → Retrieve Top-K → DeepSeek Chat → Stream Response
                                                           ↑
                                                    Citations extracted
```

## Project Structure

```
notion-ai/
├── docker-compose.yml          # Infrastructure services
├── .env.example                # Environment template
├── backend/
│   ├── src/
│   │   ├── index.ts            # Hono server entry
│   │   ├── env.ts              # Zod env validation
│   │   ├── db/                 # Drizzle schema + connection
│   │   ├── routes/             # documents, chat, search, upload, feedback
│   │   ├── services/
│   │   │   ├── deepseek/       # Chat + embedding clients
│   │   │   ├── ingestion/      # Parser, chunker, indexer, pipeline
│   │   │   ├── rag/            # Retriever, generator, engine
│   │   │   ├── eval/           # RAG evaluation framework
│   │   │   └── qdrant.ts       # Vector DB operations
│   │   └── lib/                # Citation extraction, prompts
│   └── test/
│       ├── services/           # Unit tests
│       └── integration/        # Integration tests
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   ├── components/
│   │   │   ├── sidebar/        # DocTree, new doc, upload
│   │   │   ├── editor/         # TipTap editor, toolbar, AI menu
│   │   │   ├── chat/           # Chat panel, messages, citations
│   │   │   ├── search/         # Cmd+K search dialog
│   │   │   └── ui/             # shadcn/ui primitives
│   │   ├── hooks/              # useDebounce, useStreamingChat
│   │   ├── lib/                # API client, utils
│   │   └── types/              # TypeScript interfaces
│   └── package.json
└── learning/                   # Structured learning notes
    ├── 01-rag-deep-dive.md
    ├── 02-deepseek-api.md
    ├── 03-qdrant-practice.md
    └── 04-doc-parsing.md
```

## Environment Variables

| Variable             | Default                        | Description              |
|----------------------|--------------------------------|--------------------------|
| PORT                 | 3001                           | Backend server port      |
| DATABASE_URL         | postgres://.../notion_ai       | PostgreSQL connection    |
| QDRANT_URL           | http://localhost:6334          | Qdrant gRPC endpoint     |
| MINIO_ENDPOINT       | localhost                      | MinIO S3 endpoint        |
| MINIO_PORT           | 9000                           | MinIO API port           |
| MINIO_ACCESS_KEY     | minioadmin                     | MinIO access key         |
| MINIO_SECRET_KEY     | minioadmin                     | MinIO secret key         |
| DEEPSEEK_API_KEY     | (required)                     | DeepSeek API key         |
| DEEPSEEK_BASE_URL    | https://api.deepseek.com       | DeepSeek API base URL    |
| NEXT_PUBLIC_API_URL  | http://localhost:3001           | Frontend API URL         |

## Learning Notes

This project was built as part of a structured AI fullstack learning roadmap. See `learning/` for detailed notes:

1. **RAG Deep Dive** — Embeddings, chunking strategies, retrieval patterns
2. **DeepSeek API** — Chat completion, embedding, structured output
3. **Qdrant Practice** — Collections, vector search, payload filtering
4. **Document Parsing** — PDF, Word, Markdown extraction

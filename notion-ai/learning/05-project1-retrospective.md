# Project 1 Retrospective: Notion AI Knowledge Platform

## Overview

Built a Notion-like knowledge management platform with full RAG pipeline over 30 tasks across 5 phases. This was Project 1 of the AI Fullstack learning roadmap, focused on deep-diving RAG (Retrieval Augmented Generation).

**Stack:** Next.js 16 + TipTap | Bun + Hono | PostgreSQL + pgvector | Qdrant | DeepSeek API | MinIO

## What Worked Well

### 1. Structured Learning Before Coding (Phase 1)
Spending 2 weeks on RAG, DeepSeek API, Qdrant, and document parsing fundamentals before writing any application code paid off. The throwaway experiment scripts (`learning/*.ts`) provided a safe sandbox to understand the APIs without application-layer complexity.

### 2. Subagent-Driven Development
Dispatching fresh subagents per task with two-stage review (spec compliance → code quality) kept implementation fast and focused. Mechanical tasks (CRUD routes, UI components) were handled efficiently by smaller models, while complex tasks (chunking strategies, RAG engine) got full-context reasoning.

### 3. TDD for Critical Modules
The chunking module was the right place to apply TDD. Three strategies (fixed, semantic, recursive) with edge cases (infinite loop from overlap, missing headings at position 0) were caught by tests before they became bugs. The 7 chunker tests found 2 real bugs that would have been painful to debug in production.

### 4. Clean Service Boundaries
Separating the ingestion pipeline into parser → chunker → indexer → pipeline, and the RAG engine into retriever → generator → engine, created clear interfaces. Each service was independently testable and had a single responsibility. The integration test (Task 27) validated the composition without needing all services running.

### 5. DeepSeek API Compatibility
DeepSeek's OpenAI-compatible API made integration straightforward. The chat completion endpoint (`/v1/chat/completions`), embedding endpoint (`/v1/embeddings`), and streaming (SSE) all worked with standard fetch calls. No SDK needed — TypeScript types + fetch was sufficient.

## What Didn't Work Well

### 1. Environment-Specific Issues
Bun's AVX requirement caused binary compatibility problems on the development machine, requiring the `bun-darwin-x64-baseline` build. The lightningcss native module also failed to resolve. These platform-specific issues wasted time and have no general fix — they're environment-dependent.

### 2. Next.js 16 Breaking Changes
The project used Next.js 16.2.6 which has breaking changes from the more commonly documented Next.js 14/15. The `@base-ui/react` Dialog API (used by shadcn/ui in this version) uses `render` prop instead of `asChild`, causing a persistent type error in the upload dialog. Documentation for this version is sparse.

### 3. No Real Integration Testing
The integration tests gracefully skip when Docker services or DeepSeek API are unavailable. This means the "real" end-to-end flow (file upload → live DeepSeek embedding → Qdrant search → AI chat) was never fully tested in an automated way. A CI pipeline with Docker services would solve this, but that's beyond MVP scope.

### 4. Too Many Parallel Tasks Caused Race Conditions
Dispatching Tasks 5/6/7 (learning notes) in parallel caused two tasks' files to land in the same commit due to git race conditions. The files were all correct, but the commit history was muddied. Lesson: strictly serialize tasks that write to the same directory, even if they touch different files.

## Key Technical Decisions

### Why DeepSeek API Over OpenAI?
- **Cost:** DeepSeek is significantly cheaper per token
- **Chinese language support:** Better performance on Chinese text for the translate feature
- **API compatibility:** OpenAI-compatible endpoints mean zero migration cost if switching later
- **Embedding dimension:** 1536-dim vectors, same as OpenAI text-embedding-ada-002

### Why Qdrant Over Pinecone/Weaviate?
- **Self-hosted:** Docker Compose for local dev, no cloud dependency
- **Filtering:** Payload-based filtering enables per-document search scoping
- **Performance:** Rust-native, handles the project's scale easily
- **Learning value:** Running your own vector DB teaches more than a managed service

### Why Semantic Chunking as Default?
- Best balance of chunk coherence and simplicity
- Heading-aware splitting preserves document structure for citations
- Fixed-size chunking with overlap is available for dense technical docs
- Recursive chunking handles edge cases (very long sections without headings)

### Why Bun + Hono Over Node + Express?
- **Performance:** Bun's startup time is near-instant
- **TypeScript:** First-class TS support without ts-node or tsx
- **Hono:** Lightweight, Zod validation middleware built-in, Web Standard APIs
- Simpler deployment story (single binary)

### Why TipTap Over Other Editors?
- **Extensibility:** ProseMirror-based, every feature is an extension
- **Custom nodes:** Can add citation highlights, AI-generated blocks later
- **React integration:** `useEditor` hook fits naturally with React component model
- **Active ecosystem:** StarterKit, Placeholder, Highlight extensions available

## RAG Performance Notes

The evaluation framework (`services/eval/evaluator.ts`) measures:
- **Faithfulness:** How well the answer is grounded in retrieved chunks
- **Relevance:** How well retrieved chunks match the query
- **Latency:** End-to-end response time
- **Token usage:** Input + output token counts

Key observations (without running full evals — requires DeepSeek API key):
- Embedding quality is the single biggest factor in retrieval quality
- Chunk size matters more than chunk strategy for most documents
- The citation feedback loop (upvote/downvote) is essential for improving retrieval over time
- Streaming is critical for perceived performance — users see tokens as they arrive

## Biggest Learnings

### 1. RAG Is a Pipeline, Not a Feature
Every stage (parse, chunk, embed, index, retrieve, generate) affects every other stage. A bad chunking strategy produces bad embeddings, which produces bad retrieval, which produces bad answers. The pipeline must be evaluated end-to-end, not component by component.

### 2. Embeddings Are the Bridge
The embedding model is the Rosetta Stone of RAG — it translates both documents and queries into the same vector space. If the embedding model doesn't understand your content domain, nothing downstream works. DeepSeek's embedding model handles both English and Chinese well, which matters for the translation features.

### 3. Citations Are a Product Feature
Simply generating an answer isn't enough — users need to verify the source. The `[chunk:UUID]` citation marker pattern + clickable citation links build trust. The feedback loop (👍/👎) turns user behavior into a quality signal.

### 4. SSE Streaming Changes the UX
Server-Sent Events for chat streaming make the AI feel responsive. The typing indicator + incremental text display creates a conversational feel that a synchronous response can't match. But SSE parsing is fragile — the streaming chat hook had to handle partial chunks, [DONE] markers, and connection drops.

### 5. TypeScript + Zod = Full-Stack Type Safety
Validating environment variables with Zod at startup, request bodies in route handlers, and API responses on the frontend created a type-safe pipeline from config to UI. One schema change propagates everywhere.

## What to Improve for Project 2 (Coze-like Multi-Agent Platform)

### 1. LangChain from Day One
Project 1 built the RAG pipeline manually (good for learning). Project 2 should use LangChain.js + LangGraph.js for agent orchestration, tool calling, and workflow management. The manual approach taught the fundamentals; now it's time to learn the frameworks.

### 2. Better Streaming Architecture
The current SSE implementation is bare fetch + ReadableStream parsing. For Project 2's multi-agent workflows, consider:
- Structured streaming events (agent step, tool call, result)
- Abort/retry for long-running agent chains
- Backpressure handling for fast event streams

### 3. Real Integration Tests
Set up Docker services in CI and run full end-to-end tests with the actual DeepSeek API. The eval framework exists — it should be automated.

### 4. Observability from the Start
Add structured logging, request IDs, and latency tracking from day one. Multi-agent workflows are harder to debug than a single RAG query. At minimum: OpenTelemetry tracing for agent chains.

### 5. Design Before Code
The brainstorming → spec → plan → implement workflow worked well. For Project 2's more complex architecture (agent runtime, tool registry, workflow graph), spend more time on the spec phase to get the abstractions right before writing code.

### 6. Avoid Parallel Writes to Shared Directories
The race condition in Tasks 5/6/7 was avoidable. For Project 2, serialize any tasks that write to the same directory, even if they touch different files.

## Project Stats

| Metric | Value |
|--------|-------|
| Total tasks | 30 |
| Phases | 5 |
| Backend files | ~20 |
| Frontend files | ~25 |
| Test files | 4 |
| Learning notes | 4 |
| Total commits | 25+ |
| Estimated effort | ~7 weeks at 5-8 hrs/week |

## Conclusion

Project 1 proved that a production-quality RAG system is achievable with DeepSeek API + open-source infrastructure. The key insight is that RAG is a systems integration problem: the AI parts (embeddings, generation) are API calls, while the engineering parts (parsing, chunking, indexing, streaming, UI) are where most of the work lives.

The structured learning → build → review cycle worked well. Project 2 (multi-agent workflows with LangChain) will build on the RAG foundation while introducing agent orchestration, tool calling, and workflow management.

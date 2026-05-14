# AgentForge — 多 Agent 协作平台

一个 Coze 风格的多 Agent 协作平台，支持自定义 Agent、工具配置、可视化工作流编排和实时执行追踪。作为 AI 全栈学习路线图的 Project 2。

A multi-agent collaboration platform with visual workflow orchestration, tool calling, and real-time execution tracing. Built as Project 2 of the AI Fullstack learning roadmap.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 16)                            │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐   │
│  │ Agent    │ │ Workflow     │ │ Run / Trace  │ │ Test Chat     │   │
│  │ Manager  │ │ Editor       │ │ Viewer       │ │ (SSE Stream)  │   │
│  │ (CRUD)   │ │ (React Flow) │ │ (Timeline)   │ │               │   │
│  └────┬─────┘ └──────┬───────┘ └──────┬───────┘ └───────┬───────┘   │
│       │              │               │                   │           │
│       ▼              ▼               ▼                   ▼           │
│                  REST API + SSE Streaming                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                     Backend (Bun + Hono)                              │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐   │
│  │ Agent    │ │ Workflow     │ │ Agent        │ │ Tool          │   │
│  │ CRUD     │ │ Engine       │ │ Runtime      │ │ Registry      │   │
│  │          │ │ (LangGraph)  │ │ (Custom Loop)│ │ (Built-in)    │   │
│  └────┬─────┘ └──────┬───────┘ └──────┬───────┘ └───────┬───────┘   │
│       │              │               │                   │           │
│       ▼              ▼               ▼                   ▼           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────────────┐  │
│  │PostgreSQL│ │ Qdrant   │ │ DeepSeek API (chat + function call)  │  │
│  │(pgvector)│ │ VectorDB │ │                                      │  │
│  └──────────┘ └──────────┘ └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer        | Technology                                    |
|-------------|-----------------------------------------------|
| Frontend    | Next.js 16, React 19, TailwindCSS 4, shadcn/ui |
| Workflow UI | React Flow 11.x (custom nodes, DAG editor)     |
| Backend     | Bun, Hono, Zod                                 |
| Agent Framework | Custom agent loop + LangGraph.js 1.3.x (StateGraph) |
| LLM         | DeepSeek Chat (OpenAI-compatible function calling) |
| Database    | PostgreSQL + pgvector + Drizzle ORM             |
| Vector DB   | Qdrant (Docker)                                 |
| Infra       | Docker Compose                                  |

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
- **PostgreSQL** (pgvector) on `:5433` — user: `agentforge`, pass: `agentforgepass`, db: `agent_forge`
- **Qdrant** on `:6335` (HTTP) and `:6336` (gRPC)

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
bun run db:migrate
```

### 4. Start Backend

```bash
cd backend
bun run dev
```

Server starts at `http://localhost:3002`.

### 5. Start Frontend

```bash
cd frontend
bun install
bun run dev
```

Open `http://localhost:3000`. If port 3000 is in use, Next.js will pick the next available port (e.g. 3003).

## API Endpoints

### Agents

| Method | Path               | Description                     |
|--------|--------------------|---------------------------------|
| GET    | /api/agents        | List all agents                 |
| POST   | /api/agents        | Create agent                    |
| GET    | /api/agents/:id    | Get agent by ID                 |
| PATCH  | /api/agents/:id    | Update agent                    |
| DELETE | /api/agents/:id    | Delete agent                    |
| POST   | /api/agents/:id/run | Run agent (SSE stream)          |

### Tools

| Method | Path             | Description                     |
|--------|------------------|---------------------------------|
| GET    | /api/tools       | List all tools                  |
| POST   | /api/tools       | Register tool                   |
| GET    | /api/tools/:id   | Get tool by ID                  |
| PATCH  | /api/tools/:id   | Update tool                     |
| DELETE | /api/tools/:id   | Delete tool                     |

### Workflows

| Method | Path                   | Description                     |
|--------|------------------------|---------------------------------|
| GET    | /api/workflows         | List all workflows              |
| POST   | /api/workflows         | Create workflow                 |
| GET    | /api/workflows/:id     | Get workflow by ID              |
| PATCH  | /api/workflows/:id     | Update workflow                 |
| DELETE | /api/workflows/:id     | Delete workflow                 |
| POST   | /api/workflows/:id/run | Run workflow (SSE stream)       |

### Runs

| Method | Path           | Description                     |
|--------|----------------|---------------------------------|
| GET    | /api/runs      | List all runs (recent first)    |
| GET    | /api/runs/:id  | Get run detail with trace events |

### Health

| Method | Path         | Description |
|--------|--------------|-------------|
| GET    | /api/health  | Health check |

## Agent Runtime

Single agent execution uses a custom agent loop for fine-grained SSE streaming control:

```
User Input
    │
    ▼
┌─────────────────────────────────────┐
│  Custom Agent Loop                   │
│                                      │
│  Loop (max 10 iterations):           │
│    1. LLM thinks → response          │
│       ├─ has tool_calls? → Step 2    │
│       └─ no tool_calls → return      │
│    2. Execute tools → tool results   │
│    3. Feed results back → Step 1     │
│                                      │
│  Each step emits SSE TraceEvent      │
└─────────────────────────────────────┘
```

**Built-in tools:**

| Tool         | Description                        |
|-------------|------------------------------------|
| web_search   | DuckDuckGo web search with snippet extraction |
| calculator   | Safe math expression evaluator     |
| file_reader  | Read uploaded files (path traversal protected) |

## Workflow Engine

Workflows are compiled into LangGraph StateGraph for execution:

```
Workflow JSON (nodes + edges)
    │
    ▼
┌─────────────────────────────────────┐
│  LangGraph StateGraph                │
│                                      │
│  .addNode("agent1", agentNode(...))  │
│  .addNode("agent2", agentNode(...))  │
│  .addEdge("agent1", "agent2")        │
│  .addConditionalEdges("agent2", ...)  │
│  .compile()                          │
│                                      │
│  Features:                           │
│  - Sequential execution              │
│  - Conditional routing (keyword)     │
│  - Parallel execution (no deps)      │
│  - State carried between agents       │
└─────────────────────────────────────┘
```

**Streaming events (SSE):**

```
event: agent_start     → { agentId, agentName, step }
event: thinking        → { content, step }
event: tool_call       → { toolName, toolInput, step }
event: tool_result     → { toolName, toolOutput, latencyMs }
event: agent_output    → { content, agentName, step }
event: workflow_complete → { status, totalLatencyMs }
event: error           → { message }
```

## Project Structure

```
agent-forge/
├── docker-compose.yml          # PostgreSQL + Qdrant
├── .env.example                # Environment template
├── README.md
├── backend/
│   ├── package.json
│   ├── drizzle.config.ts
│   ├── drizzle/                # Migration files
│   ├── src/
│   │   ├── index.ts            # Hono server entry
│   │   ├── env.ts              # Zod env validation
│   │   ├── db/
│   │   │   ├── connection.ts   # Drizzle + pg
│   │   │   └── schema.ts       # agents, tools, workflows, runs
│   │   ├── routes/
│   │   │   ├── agents.ts       # Agent CRUD + single run
│   │   │   ├── tools.ts        # Tool registry CRUD
│   │   │   ├── workflows.ts    # Workflow CRUD + run
│   │   │   └── runs.ts         # Run history + detail
│   │   └── services/
│   │       ├── agent/
│   │       │   ├── runtime.ts  # Custom agent loop (function calling)
│   │       │   └── stream.ts   # SSE event types + emitter
│   │       ├── workflow/
│   │       │   └── runner.ts   # LangGraph compiler + runner
│   │       ├── tools/
│   │       │   ├── registry.ts # Tool registry + seed
│   │       │   ├── execute.ts  # Tool dispatch
│   │       │   ├── web-search.ts
│   │       │   ├── calculator.ts
│   │       │   └── file-reader.ts
│   │       └── llm/
│   │           └── client.ts   # DeepSeek chat completion
│   └── tsconfig.json
├── frontend/
│   ├── package.json
│   ├── components.json         # shadcn/ui config
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx        # Dashboard
│   │   │   ├── agents/
│   │   │   │   ├── page.tsx    # Agent list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Agent editor + test chat
│   │   │   ├── workflows/
│   │   │   │   ├── page.tsx    # Workflow list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Workflow editor (React Flow)
│   │   │   └── runs/
│   │   │       ├── page.tsx    # Run history
│   │   │       └── [id]/
│   │   │           └── page.tsx  # Run trace timeline
│   │   ├── components/
│   │   │   ├── agents/
│   │   │   │   ├── agent-card.tsx
│   │   │   │   ├── agent-form.tsx
│   │   │   │   ├── test-chat.tsx      # SSE streaming chat
│   │   │   │   └── tool-picker.tsx
│   │   │   └── workflow/
│   │   │       ├── agent-node.tsx      # Custom React Flow node
│   │   │       ├── agent-panel.tsx     # Draggable agent list
│   │   │       ├── run-console.tsx     # SSE event console
│   │   │       └── workflow-toolbar.tsx
│   │   ├── hooks/
│   │   │   ├── use-agent-run.ts       # Single agent SSE hook
│   │   │   └── use-workflow-run.ts    # Workflow SSE hook
│   │   ├── lib/
│   │   │   ├── api-client.ts          # Fetch wrapper
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── index.ts
│   └── tsconfig.json
└── learning/                   # Learning notes (planned)
```

## Environment Variables

| Variable             | Default                                                 | Description              |
|----------------------|---------------------------------------------------------|--------------------------|
| PORT                 | 3002                                                    | Backend server port      |
| DATABASE_URL         | postgres://agentforge:agentforgepass@localhost:5433/agent_forge | PostgreSQL connection |
| QDRANT_URL           | http://localhost:6335                                   | Qdrant HTTP endpoint     |
| DEEPSEEK_API_KEY     | (required)                                              | DeepSeek API key         |
| DEEPSEEK_BASE_URL    | https://api.deepseek.com                                | DeepSeek API base URL    |
| NEXT_PUBLIC_API_URL  | http://localhost:3002                                   | Frontend API URL         |

## Database Schema

4 core tables:

- **agents** — Agent definition (name, system prompt, model, temperature, toolIds)
- **tools** — Tool registry (name, display name, description, input schema JSON, config)
- **workflows** — Workflow graph (nodes JSON, edges JSON)
- **runs** — Execution records (status, input, output, trace events JSON)

## Key Technical Decisions

1. **Custom Agent Loop over LangChain AgentExecutor** — Fine-grained control over each tool call → SSE event emission; LangChain's AgentExecutor doesn't expose per-iteration hooks cleanly
2. **LangGraph StateGraph for workflow execution** — State management, conditional routing, parallel execution out of the box; `streamEvents()` for structured streaming
3. **DeepSeek Function Calling** — OpenAI-compatible, no custom tool parsing needed; LangChain `tool()` converts Zod schema to JSON Schema automatically
4. **React Flow for DAG editing** — Mature library with custom nodes, drag-drop, zoom/pan, minimap; used by Notion internally
5. **Structured SSE over WebSocket** — Unidirectional streaming (server → client) is sufficient; reuse SSE pattern from Project 1

# Qdrant Hands-On — Structured Learning Notes

## 1. Client Setup & Connection

### Installing the Client

```bash
npm install @qdrant/js-client-rest
```

### Creating a QdrantClient Instance

Connecting to a local Docker Qdrant instance (default REST port 6333, gRPC port 6334):

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({
  url: "http://localhost:6333",   // REST API
  // For gRPC, use port 6334:
  // url: "http://localhost:6334",
});
```

> **Note**: Port `6333` is the REST API (default for `@qdrant/js-client-rest`). Port `6334` is the gRPC interface. The REST client communicates over `6333`.

### Starting Qdrant with Docker

```bash
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

- `6333` — REST API (health, CRUD, search)
- `6334` — gRPC interface
- `6335` — Internal cluster communication (not needed for single-node)

---

## 2. Collection Management

### Creating a Collection

A collection must be created with a vector configuration before any points can be inserted.

```typescript
await client.createCollection("document_chunks", {
  vectors: {
    size: 1536,          // DeepSeek embedding dimension
    distance: "Cosine",  // Distance metric: Cosine / Dot / Euclid
  },
});
```

**Parameters**:

| Field | Description |
|---|---|
| `vectors.size` | Dimensionality of the embedding vectors |
| `vectors.distance` | Similarity metric (`Cosine`, `Dot`, `Euclid`) |
| `on_disk` | Store vectors on disk rather than in RAM (default `false`) |

### Listing Collections

```typescript
const collections = await client.getCollections();
for (const col of collections.collections) {
  console.log(col.name);
}
```

### Checking Collection Info

```typescript
const info = await client.getCollection("document_chunks");
console.log(info);
// {
//   status: "green",
//   optimizer_status: "ok",
//   vectors_count: 42,
//   points_count: 42,
//   ...
// }
```

### Deleting a Collection

```typescript
await client.deleteCollection("document_chunks");
```

> Warning: This is irreversible. All vectors and payloads are removed.

---

## 3. Inserting & Searching Vectors

### Point Structure

A point in Qdrant consists of:

- `id` — unique identifier (number or UUID)
- `vector` — the embedding array
- `payload` — arbitrary JSON metadata

### Upserting Points with Payloads

```typescript
await client.upsert("document_chunks", {
  points: [
    {
      id: 1,
      vector: [0.012, -0.034, ..., 0.056],  // 1536-dim array
      payload: {
        docId: "doc_001",
        chunkIndex: 0,
        text: "Introduction to RAG...",
        headingPath: ["RAG Overview", "What is RAG?"],
        charStart: 0,
        charEnd: 120,
      },
    },
    {
      id: 2,
      vector: [0.045, 0.012, ..., -0.021],
      payload: {
        docId: "doc_001",
        chunkIndex: 1,
        text: "Embedding models convert text into vectors...",
        headingPath: ["RAG Overview", "Embedding Models"],
        charStart: 121,
        charEnd: 340,
      },
    },
  ],
});
```

### Single Vector Search

```typescript
const searchResult = await client.search("document_chunks", {
  vector: [0.023, -0.011, ..., 0.078],  // query embedding
  limit: 5,
  with_payload: true,
});

for (const hit of searchResult) {
  console.log(`Score: ${hit.score}, Text: ${hit.payload?.text}`);
}
```

### Batch Upsert for Efficiency

For large ingestion jobs, batch upserts drastically reduce overhead by sending multiple points in a single HTTP request.

```typescript
const BATCH_SIZE = 100;

async function batchUpsert(
  collectionName: string,
  points: Array<{ id: number; vector: number[]; payload: Record<string, unknown> }>,
) {
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await client.upsert(collectionName, { points: batch });
    console.log(`Upserted batch ${i / BATCH_SIZE + 1} (${batch.length} points)`);
  }
}
```

> Guidelines:
> - Batch size of 100–500 points per request is typical
> - Too large a batch causes request timeouts; too small wastes HTTP overhead
> - Always batch — inserting one point at a time is extremely slow

---

## 4. Filtering & Payload Operations

### Filtering Search Results

Filters narrow search results by payload fields. Qdrant uses a declarative filter syntax:

```typescript
const result = await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [
      {
        key: "docId",
        match: { value: "doc_001" },
      },
    ],
  },
  limit: 10,
  with_payload: true,
});
```

**Compound filters** (AND / OR):

```typescript
const result = await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [
      { key: "docId", match: { value: "doc_001" } },
      { key: "chunkIndex", range: { gte: 0, lte: 5 } },
    ],
  },
  limit: 10,
});
```

**Filter conditions**:

| Condition | Syntax | Use case |
|---|---|---|
| `match` | `{ value: "str" }` | Exact string match |
| `match` | `{ value: 42 }` | Exact integer match |
| `range` | `{ gte: 0, lte: 100 }` | Numeric range |
| `must_not` | `[...]` | Negative filter |
| `should` | `[...]` | OR logic (at least one must match) |

### Payload Indexing for Faster Filtering

Without an index, filtering scans all points. Create an index on frequently filtered fields:

```typescript
// Create keyword index on docId
await client.createPayloadIndex("document_chunks", {
  field_name: "docId",
  field_type: "keyword",
});

// Create integer index on chunkIndex
await client.createPayloadIndex("document_chunks", {
  field_name: "chunkIndex",
  field_type: "integer",
});
```

**Which fields to index**:
- `docId` → keyword index (used to scope search to a specific document)
- `chunkIndex` → integer index (used for ordering chunks)
- `headingPath` → keyword index (if filtering by heading)
- `charStart` / `charEnd` → integer index (used for character-range queries)

> Skipping indexing on rarely-filtered fields saves memory and reduces write latency.

### Scroll API for Pagination

Use `scroll` to iterate over all points in a collection (or a filtered subset) without vector search:

```typescript
async function scrollAllPoints(collectionName: string) {
  let offset: string | number | undefined = undefined;
  let allPoints: any[] = [];

  do {
    const result = await client.scroll(collectionName, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,  // omit vectors for speed
    });

    allPoints.push(...result.points);
    offset = result.next_page_offset;
  } while (offset !== null);

  return allPoints;
}
```

**Key options**:

| Parameter | Description |
|---|---|
| `limit` | Page size (max 1000 per call) |
| `offset` | Cursor for the next page |
| `filter` | Optional filter to restrict scrolled points |
| `with_payload` | Include payload data |
| `with_vector` | Include vector data (set to `false` for payload-only operations) |

**Filtered scroll**:

```typescript
const result = await client.scroll("document_chunks", {
  filter: {
    must: [{ key: "docId", match: { value: "doc_001" } }],
  },
  limit: 50,
  with_payload: true,
  with_vector: false,
});
```

---

## 5. Collection Design for This Project

### Document Chunks Schema

```
Collection: "document_chunks"
  - Vector size: 1536 (DeepSeek embedding dimension)
  - Distance: Cosine
  - Payload fields:
    - docId: string (keyword index)
    - chunkIndex: integer (integer index)
    - text: string
    - headingPath: string[] (keyword index)
    - charStart: integer
    - charEnd: integer
```

### Design Rationale

| Decision | Reason |
|---|---|
| **Vector size: 1536** | Matches `text-embedding-3-small` output dimension. If switching to DeepSeek (1024-dim), update the collection config |
| **Distance: Cosine** | Standard for text embeddings. All vectors are L2-normalized by the embedding model |
| **`docId` as keyword index** | Primary filter field — every search will scope to a single document or a known set of documents |
| **`chunkIndex` as integer index** | Needed for reconstructing chunk order after retrieval, and for range queries |
| **`headingPath` as string array** | Preserves the heading hierarchy of each chunk (e.g., `["Section 1", "Subsection A"]`) for context-aware display |
| **`charStart` / `charEnd`** | Allow precise character-level citation from the original document |

### Typical Query Patterns

```typescript
// 1. Search within a specific document
await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [{ key: "docId", match: { value: "doc_001" } }],
  },
  limit: 5,
});

// 2. Global search across all documents
await client.search("document_chunks", {
  vector: queryVector,
  limit: 10,
});

// 3. Retrieve all chunks of a document (for display / citation)
await client.scroll("document_chunks", {
  filter: {
    must: [{ key: "docId", match: { value: "doc_001" } }],
  },
  order_by: "chunkIndex",
  limit: 200,
});

// 4. Search within a specific heading subtree
await client.search("document_chunks", {
  vector: queryVector,
  filter: {
    must: [
      { key: "docId", match: { value: "doc_001" } },
      { key: "headingPath", match: { value: "Architecture Overview" } },
    ],
  },
  limit: 5,
});
```

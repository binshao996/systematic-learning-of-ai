/**
 * qdrant-experiment.ts
 *
 * A throwaway script demonstrating Qdrant vector DB operations:
 *   1) Client setup
 *   2) Create collection
 *   3) Upsert points with payloads
 *   4) Vector search
 *   5) Filtered search by docId
 *   6) Scroll all points
 *
 * This is NOT meant to be run — it's an illustration of the Qdrant flow.
 * Requires a local Qdrant instance on port 6333.
 */

import { QdrantClient } from "@qdrant/js-client-rest";

// ─── 1. Client Setup ──────────────────────────────────────────────────────────────

const client = new QdrantClient({
  url: "http://localhost:6333",
});

const COLLECTION = "document_chunks";

// ─── 2. Create Collection ─────────────────────────────────────────────────────────

async function createCollection() {
  // Delete if already exists (idempotent setup)
  const existing = await client.getCollections();
  if (existing.collections.some((c) => c.name === COLLECTION)) {
    await client.deleteCollection(COLLECTION);
  }

  await client.createCollection(COLLECTION, {
    vectors: {
      size: 1536,          // text-embedding-3-small / DeepSeek dim
      distance: "Cosine",  // Standard for text embeddings
    },
  });

  // Create payload indexes for filter fields
  await client.createPayloadIndex(COLLECTION, {
    field_name: "docId",
    field_type: "keyword",
  });
  await client.createPayloadIndex(COLLECTION, {
    field_name: "chunkIndex",
    field_type: "integer",
  });
  await client.createPayloadIndex(COLLECTION, {
    field_name: "headingPath",
    field_type: "keyword",
  });

  console.log(`Collection "${COLLECTION}" created with indexes`);
}

// ─── 3. Upsert Points ─────────────────────────────────────────────────────────────

function generateRandomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

interface ChunkPayload {
  docId: string;
  chunkIndex: number;
  text: string;
  headingPath: string[];
  charStart: number;
  charEnd: number;
}

async function upsertPoints() {
  const chunks: Array<{ id: number; vector: number[]; payload: ChunkPayload }> = [
    {
      id: 1,
      vector: generateRandomVector(1536),
      payload: {
        docId: "doc_001",
        chunkIndex: 0,
        text: "Retrieval-Augmented Generation (RAG) combines retrieval with generation.",
        headingPath: ["RAG Overview", "Introduction"],
        charStart: 0,
        charEnd: 85,
      },
    },
    {
      id: 2,
      vector: generateRandomVector(1536),
      payload: {
        docId: "doc_001",
        chunkIndex: 1,
        text: "Embedding models like DeepSeek and OpenAI text-embedding-3 convert text into dense vectors.",
        headingPath: ["RAG Overview", "Embedding Models"],
        charStart: 86,
        charEnd: 185,
      },
    },
    {
      id: 3,
      vector: generateRandomVector(1536),
      payload: {
        docId: "doc_002",
        chunkIndex: 0,
        text: "Qdrant is an open-source vector database written in Rust.",
        headingPath: ["Vector Databases", "Qdrant"],
        charStart: 0,
        charEnd: 65,
      },
    },
    {
      id: 4,
      vector: generateRandomVector(1536),
      payload: {
        docId: "doc_002",
        chunkIndex: 1,
        text: "Qdrant supports filtering, payload indexing, and horizontal scaling.",
        headingPath: ["Vector Databases", "Qdrant Features"],
        charStart: 66,
        charEnd: 130,
      },
    },
  ];

  // Batch upsert all points at once
  await client.upsert(COLLECTION, { points: chunks });
  console.log(`Upserted ${chunks.length} points`);
}

// ─── 4. Search (Single Vector) ────────────────────────────────────────────────────

async function search() {
  const queryVector = generateRandomVector(1536);

  const results = await client.search(COLLECTION, {
    vector: queryVector,
    limit: 3,
    with_payload: true,
  });

  console.log("\n--- Search Results (top 3) ---");
  for (const hit of results) {
    const p = hit.payload as ChunkPayload;
    console.log(`  Score: ${hit.score.toFixed(4)}`);
    console.log(`  Doc:   ${p.docId}[${p.chunkIndex}]`);
    console.log(`  Text:  ${p.text}`);
    console.log();
  }
}

// ─── 5. Filtered Search by docId ──────────────────────────────────────────────────

async function filteredSearch() {
  const queryVector = generateRandomVector(1536);

  const results = await client.search(COLLECTION, {
    vector: queryVector,
    filter: {
      must: [{ key: "docId", match: { value: "doc_001" } }],
    },
    limit: 5,
    with_payload: true,
  });

  console.log("\n--- Filtered Search (doc_001 only) ---");
  for (const hit of results) {
    const p = hit.payload as ChunkPayload;
    console.log(`  Score: ${hit.score.toFixed(4)} | ${p.docId}[${p.chunkIndex}]: ${p.text}`);
  }
}

// ─── 6. Scroll All Points (Pagination) ────────────────────────────────────────────

async function scrollAll() {
  let offset: string | number | undefined = undefined;
  let totalCount = 0;

  console.log("\n--- Scrolling All Points ---");

  do {
    const page = await client.scroll(COLLECTION, {
      limit: 2,          // Small page size to demonstrate pagination
      offset,
      with_payload: true,
      with_vector: false, // Skip vectors — we only need payloads
    });

    for (const point of page.points) {
      const p = point.payload as ChunkPayload;
      console.log(`  Point ${point.id}: ${p.docId}[${p.chunkIndex}] — "${p.text.slice(0, 50)}..."`);
      totalCount++;
    }

    offset = page.next_page_offset;
  } while (offset !== null);

  console.log(`Total points: ${totalCount}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────────

async function main() {
  await createCollection();
  await upsertPoints();
  await search();
  await filteredSearch();
  await scrollAll();
}

main().catch(console.error);

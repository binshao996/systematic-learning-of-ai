/**
 * rag-experiment.ts
 *
 * A throwaway script demonstrating the full RAG pipeline:
 *   1) Hardcoded documents
 *   2) DeepSeek Embedding call
 *   3) Cosine similarity search
 *   4) DeepSeek Chat call with retrieved context
 *
 * This is NOT meant to be run — it's an illustration of the RAG flow.
 * API keys, endpoints, and types are approximate.
 */

// ─── 1. Hardcoded Documents ───────────────────────────────────────────────────

interface Document {
  id: string;
  text: string;
  heading: string;
}

const DOCUMENTS: Document[] = [
  {
    id: "1",
    heading: "Introduction to RAG",
    text: "Retrieval-Augmented Generation (RAG) is a technique that combines "
      + "information retrieval with text generation. It retrieves relevant "
      + "documents from a knowledge base and uses them as context for an LLM. "
      + "This grounds the model's output in factual information.",
  },
  {
    id: "2",
    heading: "Embedding Models",
    text: "Embedding models convert text into dense vector representations. "
      + "These vectors capture semantic meaning: similar texts produce similar "
      + "vectors. Cosine similarity measures the angle between two vectors and "
      + "is the standard metric for retrieval. DeepSeek-Embedding produces "
      + "1024-dimensional vectors.",
  },
  {
    id: "3",
    heading: "Chunking Strategies",
    text: "Documents must be split into chunks before embedding. Fixed-size "
      + "chunking splits by token count. Semantic chunking splits on natural "
      + "boundaries like paragraphs. Recursive chunking tries multiple "
      + "separators in order. Overlap (10-20%) prevents information loss at "
      + "chunk boundaries.",
  },
  {
    id: "4",
    heading: "Retrieval Methods",
    text: "Dense retrieval uses vector similarity to find semantically related "
      + "texts. Sparse retrieval (BM25) matches keywords and works well for "
      + "technical terms. Hybrid search combines both approaches with a "
      + "weighted score or reciprocal rank fusion.",
  },
  {
    id: "5",
    heading: "Reranking",
    text: "After initial retrieval, a cross-encoder reranker scores each "
      + "(query, document) pair jointly. This is more accurate than embedding "
      + "similarity but too slow to run on the full corpus. Typical pipeline: "
      + "embedding retriever gets top-50, reranker picks top-5.",
  },
];

// ─── 2. Simulated DeepSeek Embedding Call ─────────────────────────────────────

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.deepseek.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-embedding",
      input: [text],
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }

  const json: EmbeddingResponse = await response.json();
  return json.data[0].embedding;
}

// ─── 3. Cosine Similarity ─────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

interface ScoredDocument extends Document {
  score: number;
}

function retrieve(
  queryEmbedding: number[],
  documentEmbeddings: Map<string, number[]>,
  documents: Document[],
  topK: number = 3
): ScoredDocument[] {
  const scored: ScoredDocument[] = documents.map((doc) => {
    const docEmbedding = documentEmbeddings.get(doc.id)!;
    return {
      ...doc,
      score: cosineSimilarity(queryEmbedding, docEmbedding),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ─── 4. DeepSeek Chat Call with Retrieved Context ─────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
}

async function generateAnswer(
  query: string,
  context: ScoredDocument[]
): Promise<string> {
  const contextBlock = context
    .map((doc, i) => `[${i}] ${doc.text} (source: ${doc.heading})`)
    .join("\n\n");

  const systemPrompt =
    "You are a helpful assistant. Answer the user's question using ONLY the "
    + "provided context. If the context does not contain the answer, say "
    + "\"I cannot answer this based on the provided context.\" "
    + "Cite sources using [0], [1], etc.";

  const userPrompt = `Context:\n${contextBlock}\n\nQuestion: ${query}`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
  }

  const json: ChatResponse = await response.json();
  return json.choices[0].message.content;
}

// ─── 5. Main Pipeline ─────────────────────────────────────────────────────────

async function main() {
  // Step 1: Embed all documents
  console.log("Embedding documents...");
  const documentEmbeddings = new Map<string, number[]>();

  for (const doc of DOCUMENTS) {
    const embedding = await getEmbedding(doc.text);
    documentEmbeddings.set(doc.id, embedding);
  }

  // Step 2: User asks a question
  const query = "How does hybrid search combine dense and sparse retrieval?";

  // Step 3: Embed the query
  console.log(`Query: "${query}"`);
  const queryEmbedding = await getEmbedding(query);

  // Step 4: Retrieve top-k documents
  const topDocuments = retrieve(queryEmbedding, documentEmbeddings, DOCUMENTS, 2);
  console.log("Retrieved:", topDocuments.map((d) => `[${d.score.toFixed(4)}] ${d.heading}`).join(", "));

  // Step 5: Generate answer with context
  console.log("Generating answer...");
  const answer = await generateAnswer(query, topDocuments);

  console.log(`\nAnswer:\n${answer}`);
}

// NOTE: Running this requires DEEPSEEK_API_KEY in environment.
// It is a demo of the pipeline shape, not meant for production.
//
// main().catch(console.error);

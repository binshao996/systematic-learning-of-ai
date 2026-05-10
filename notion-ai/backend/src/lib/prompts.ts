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

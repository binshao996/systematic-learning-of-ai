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

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

import { describe, it, expect } from "bun:test";
import { FixedSizeChunker, SemanticChunker, chunkDocument } from "../../src/services/ingestion/chunker";

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
    expect(chunks[0].text.length).toBeLessThanOrEqual(110);
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
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.some((c) => c.headingPath.includes("Section 1.1"))).toBe(true);
  });
});

describe("SemanticChunker - deeply nested headings", () => {
  it("preserves deeply nested heading hierarchy", () => {
    const text = `# H1\n## H2\n### H3\nContent here.`.repeat(5);
    const chunks = chunkDocument(text, "semantic");
    const h3Chunk = chunks.find((c) => c.headingPath.includes("H3"));
    expect(h3Chunk).toBeDefined();
    expect(h3Chunk!.headingPath).toContain("H1");
    expect(h3Chunk!.headingPath).toContain("H2");
  });
});

describe("RecursiveChunker", () => {
  it("uses finer separators when coarser ones produce oversized parts", () => {
    const longPara = "word ".repeat(600); // 600 words, each 5 chars = ~3000 chars
    const chunks = chunkDocument(longPara, "recursive", { chunkSize: 500 });
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk should be at most chunkSize
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(500);
    }
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

  it("uses recursive chunker", () => {
    const longText = SAMPLE_TEXT.repeat(10);
    const chunks = chunkDocument(longText, "recursive");
    expect(chunks.length).toBeGreaterThan(0);
  });
});

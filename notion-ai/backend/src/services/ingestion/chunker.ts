export interface Chunk {
  text: string;
  chunkIndex: number;
  headingPath: string[];
  charStart: number;
  charEnd: number;
}

const RECURSIVE_SEPARATORS = [
  "\n\n", // paragraphs
  "\n", // lines
  ". ", // sentences
  " ", // words
  "", // characters
];

export function FixedSizeChunker(
  text: string,
  opts: { chunkSize: number; overlap: number }
): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + opts.chunkSize, text.length);
    const chunkText = text.slice(start, end);
    // Pass chunkText to ensure heading continuity in overlaps
    const headingPath = extractHeadingPath(text, start, chunkText);

    chunks.push({
      text: chunkText,
      chunkIndex: index++,
      headingPath,
      charStart: start,
      charEnd: end,
    });

    if (end === text.length) break;
    start = end - opts.overlap;
  }

  return chunks;
}

export function SemanticChunker(text: string): Chunk[] {
  const sections = text.split(/(?=^#{1,6}\s)/m);
  const chunks: Chunk[] = [];
  let charOffset = 0;

  // Track heading hierarchy across sections
  const activeHeadings: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section.trim()) {
      charOffset += section.length;
      continue;
    }

    // Scan ALL headings in this section to build accurate hierarchy
    const sectionHeadings = section.matchAll(/^(#{1,6})\s+(.+)/gm);
    for (const m of sectionHeadings) {
      const level = m[1].length;
      const headingText = m[2].trim();
      activeHeadings.length = level - 1;
      activeHeadings[level - 1] = headingText;
    }

    const headingPath = [...activeHeadings].filter(Boolean);

    if (section.length > 1000) {
      const paragraphs = section.split(/\n\n+/);
      for (const para of paragraphs) {
        if (!para.trim()) continue;
        chunks.push({
          text: para.trim(),
          chunkIndex: chunks.length,
          headingPath,
          charStart: charOffset,
          charEnd: charOffset + para.length,
        });
        charOffset += para.length;
      }
    } else {
      chunks.push({
        text: section.trim(),
        chunkIndex: chunks.length,
        headingPath,
        charStart: charOffset,
        charEnd: charOffset + section.length,
      });
      charOffset += section.length;
    }
  }

  return chunks;
}

/**
 * RecursiveChunker tries to split on increasingly finer separators
 * (paragraphs -> lines -> sentences -> words -> characters).
 * It uses the first separator where all resulting parts are under chunkSize,
 * then merges adjacent parts into chunks up to chunkSize.
 * Falls through to character-level splitting if no separator works.
 */
export function RecursiveChunker(
  text: string,
  opts: { chunkSize: number }
): Chunk[] {
  if (!text) return [];

  for (const separator of RECURSIVE_SEPARATORS) {
    if (separator === "") {
      return splitIntoCharacterChunks(text, opts.chunkSize);
    }

    const parts = text.split(separator);
    // Check if all parts are under chunkSize
    const allUnder = parts.every((p) => p.length <= opts.chunkSize);

    if (allUnder) {
      return buildChunksFromParts(text, parts, separator, opts.chunkSize);
    }
  }

  // Fallback (should not reach here since "" always works)
  return splitIntoCharacterChunks(text, opts.chunkSize);
}

function buildChunksFromParts(
  text: string,
  parts: string[],
  separator: string,
  chunkSize: number
): Chunk[] {
  const chunks: Chunk[] = [];

  let startIdx = 0;
  while (startIdx < parts.length) {
    let endIdx = startIdx + 1;
    // Accumulate parts until adding the next would exceed chunkSize
    while (endIdx < parts.length) {
      const candidate = parts.slice(startIdx, endIdx + 1).join(separator);
      if (candidate.length > chunkSize) break;
      endIdx++;
    }

    const chunkText = parts.slice(startIdx, endIdx).join(separator);
    const charStart = computeCharStart(parts, separator, startIdx);

    chunks.push({
      text: chunkText,
      chunkIndex: chunks.length,
      headingPath: extractHeadingPath(text, charStart, chunkText),
      charStart,
      charEnd: charStart + chunkText.length,
    });

    startIdx = endIdx;
  }

  return chunks;
}

function splitIntoCharacterChunks(
  text: string,
  chunkSize: number
): Chunk[] {
  const chunks: Chunk[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunkText = text.slice(i, i + chunkSize);
    chunks.push({
      text: chunkText,
      chunkIndex: chunks.length,
      headingPath: extractHeadingPath(text, i, chunkText),
      charStart: i,
      charEnd: i + chunkText.length,
    });
  }
  return chunks;
}

/**
 * Compute the character position of parts[startIdx] in the original text.
 * This accounts for all previous parts and their separating characters.
 */
function computeCharStart(
  parts: string[],
  separator: string,
  startIdx: number
): number {
  let pos = 0;
  for (let i = 0; i < startIdx; i++) {
    pos += parts[i].length;
    pos += separator.length;
  }
  return pos;
}

export function chunkDocument(
  text: string,
  strategy: "fixed" | "semantic" | "recursive" = "semantic",
  opts?: { chunkSize?: number; overlap?: number }
): Chunk[] {
  switch (strategy) {
    case "fixed":
      return FixedSizeChunker(text, {
        chunkSize: opts?.chunkSize ?? 500,
        overlap: opts?.overlap ?? 50,
      });
    case "semantic":
      return SemanticChunker(text);
    case "recursive":
      return RecursiveChunker(text, {
        chunkSize: opts?.chunkSize ?? 500,
      });
  }
}

function extractHeadingPath(
  text: string,
  position: number,
  chunkText?: string
): string[] {
  // Look at text before position for headings
  const beforeText = text.slice(0, position);
  const headings: string[] = [];
  const matches = beforeText.matchAll(/^(#{1,6})\s+(.+)/gm);
  for (const m of matches) {
    const level = m[1].length;
    headings.length = level - 1;
    headings[level - 1] = m[2].trim();
  }

  // Scan the chunk's own text for headings (ensures heading continuity in overlaps).
  // Only populate heading levels that are NOT already set from before-text context,
  // preventing same-level headings within the chunk from overriding the outer context.
  const textToScan = chunkText ?? text.slice(position).split("\n")[0];
  const chunkMatches = textToScan.matchAll(/^(#{1,6})\s+(.+)/gm);
  for (const m of chunkMatches) {
    const level = m[1].length;
    const headingText = m[2].trim();
    const idx = level - 1;
    if (headings[idx] === undefined) {
      headings[idx] = headingText;
    }
  }

  return headings.filter(Boolean);
}

export interface Chunk {
  text: string;
  chunkIndex: number;
  headingPath: string[];
  charStart: number;
  charEnd: number;
}

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
    const headingPath = extractHeadingPath(text, start);

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

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section.trim()) continue;

    const headingMatch = section.match(/^(#{1,6})\s+(.+)/m);
    const headingPath = headingMatch ? [headingMatch[2].trim()] : [];

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

export function chunkDocument(
  text: string,
  strategy: "fixed" | "semantic" | "recursive" = "semantic",
  opts?: { chunkSize?: number; overlap?: number }
): Chunk[] {
  switch (strategy) {
    case "fixed":
      return FixedSizeChunker(text, { chunkSize: opts?.chunkSize ?? 500, overlap: opts?.overlap ?? 50 });
    case "semantic":
      return SemanticChunker(text);
    case "recursive": {
      const semantic = SemanticChunker(text);
      return semantic.flatMap((c) =>
        c.text.length > 1000
          ? FixedSizeChunker(c.text, { chunkSize: 500, overlap: 50 }).map((fc) => ({
              ...fc,
              headingPath: [...c.headingPath, ...fc.headingPath],
            }))
          : [c]
      );
    }
  }
}

function extractHeadingPath(text: string, position: number): string[] {
  // Look at text before position plus the current line for headings
  const beforeText = text.slice(0, position);
  const headings: string[] = [];
  const matches = beforeText.matchAll(/^(#{1,6})\s+(.+)/gm);
  for (const m of matches) {
    const level = m[1].length;
    headings.length = level - 1;
    headings[level - 1] = m[2].trim();
  }

  // Also check if the current position starts a heading line
  const remainingLine = text.slice(position).split("\n")[0];
  const currentHeading = remainingLine.match(/^(#{1,6})\s+(.+)/);
  if (currentHeading) {
    const level = currentHeading[1].length;
    headings.length = level - 1;
    headings[level - 1] = currentHeading[2].trim();
  }

  return headings.filter(Boolean);
}

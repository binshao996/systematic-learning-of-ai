/**
 * parser-experiment.ts
 *
 * Illustrates the file-routing pattern for the unified document parser.
 * NOT meant to be executed (dependency stubs shown for illustration only).
 *
 * The real parsers live in the backend service; this file captures the
 * architecture decisions that were made during learning.
 */

// ---------------------------------------------------------------------------
// Types — shared across all parsers
// ---------------------------------------------------------------------------

interface ParsedDocument {
  text: string;
  sections: Section[];
  metadata: {
    sourceFile: string;
    fileType: "pdf" | "docx" | "md" | "txt";
    pageCount: number | null;
    headings: string[];
  };
}

interface Section {
  heading: string;
  headingLevel: number;
  content: string;
  pageNumber: number | null;
  hasTable: boolean;
  hasCode: boolean;
}

// ---------------------------------------------------------------------------
// File-type detection
// ---------------------------------------------------------------------------

type FileType = "pdf" | "docx" | "md" | "txt";

function detectFileType(filePath: string): FileType {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, FileType> = {
    pdf: "pdf",
    docx: "docx",
    md: "md",
    markdown: "md",
    mdx: "md",
    txt: "txt",
    text: "txt",
  };
  return extMap[ext] ?? "txt";
}

type ParserFn = (filePath: string) => Promise<ParsedDocument>;

// ---------------------------------------------------------------------------
// PDF parser (unpdf-based)
// ---------------------------------------------------------------------------

// Stub — requires `bun add unpdf`
async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const { readFileSync } = await import("node:fs");
  const { getDocument, extractText } = await import("unpdf");

  const buffer = readFileSync(filePath);
  const pdf = await getDocument(buffer);
  const { pages } = await extractText(pdf);

  const allText = pages.map((p: any) => p.content).join("\n\n");
  const allHeadings = pages
    .flatMap((p: any) => detectHeadings(p.content))
    .filter(Boolean);

  const sections: Section[] = pages.map((page: any) => ({
    heading: detectHeadings(page.content)?.[0] ?? `Page ${page.pageNumber}`,
    headingLevel: 1,
    content: page.content,
    pageNumber: page.pageNumber,
    hasTable: false,
    hasCode: false,
  }));

  return {
    text: allText,
    sections,
    metadata: {
      sourceFile: filePath,
      fileType: "pdf",
      pageCount: pages.length,
      headings: allHeadings,
    },
  };
}

function detectHeadings(text: string): string[] {
  // Heuristic: lines that are SHORT, ALL-CAPS, or end with a colon
  return text
    .split("\n")
    .filter(
      (line) =>
        line.trim().length > 0 &&
        line.trim().length < 80 &&
        (line.trim() === line.trim().toUpperCase() || line.trim().endsWith(":"))
    )
    .map((l) => l.trim());
}

// ---------------------------------------------------------------------------
// DOCX parser (mammoth-based)
// ---------------------------------------------------------------------------

// Stub — requires `bun add mammoth`
async function parseDocx(filePath: string): Promise<ParsedDocument> {
  const { readFileSync } = await import("node:fs");
  const mammoth = await import("mammoth");

  const buffer = readFileSync(filePath);
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;

  // Naive HTML heading extraction — in production, use a proper HTML parser
  const headingRegex = /<(h[1-6])>([^<]+)<\/\1>/g;
  const headings: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    headings.push(match[2]);
  }

  const plainText = html.replace(/<[^>]+>/g, "").trim();
  const hasTables = /<table/i.test(html);

  const sections: Section[] = splitHtmlByHeadings(html);

  return {
    text: plainText,
    sections,
    metadata: {
      sourceFile: filePath,
      fileType: "docx",
      pageCount: null, // DOCX has no native pages in modern readers
      headings,
    },
  };
}

function splitHtmlByHeadings(html: string): Section[] {
  // Split on any <h1-6> tag, preserving heading level
  const parts = html.split(/(<(h[1-6])>.*?<\/\2>)/s);
  const sections: Section[] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentContent = "";

  for (const part of parts) {
    const hMatch = part.match(/<(h([1-6]))>(.*?)<\/\1>/);
    if (hMatch) {
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          headingLevel: currentLevel,
          content: stripHtml(currentContent).trim(),
          pageNumber: null,
          hasTable: /<table/i.test(currentContent),
          hasCode: false,
        });
      }
      currentHeading = hMatch[3];
      currentLevel = parseInt(hMatch[2], 10);
      currentContent = "";
    } else {
      currentContent += part + " ";
    }
  }

  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      headingLevel: currentLevel,
      content: stripHtml(currentContent).trim(),
      pageNumber: null,
      hasTable: /<table/i.test(currentContent),
      hasCode: false,
    });
  }

  return sections;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Markdown parser (remark-based)
// ---------------------------------------------------------------------------

// Stub — requires `bun add unified remark-parse remark-gfm unist-util-visit`
async function parseMarkdown(filePath: string): Promise<ParsedDocument> {
  const { readFileSync } = await import("node:fs");
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const { visit } = await import("unist-util-visit");

  const content = readFileSync(filePath, "utf-8");
  const processor = unified().use(remarkParse);
  const tree = processor.parse(content) as any;

  // Collect headings
  const headings: string[] = [];
  visit(tree, "heading", (node: any) => {
    const text = node.children.map((c: any) => c.value ?? "").join("");
    headings.push(text);
  });

  // Collect code blocks
  const codeBlockLines = new Set<number>();
  visit(tree, "code", (node: any) => {
    // Track the line numbers where code blocks appear
    if (node.position) {
      for (let i = node.position.start.line; i <= node.position.end.line; i++) {
        codeBlockLines.add(i);
      }
    }
  });

  // Split into sections by heading
  const sections: Section[] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentLines: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          headingLevel: currentLevel,
          content: currentLines.join("\n").trim(),
          pageNumber: null,
          hasTable: currentLines.join("\n").includes("|"),
          hasCode: currentLines.some((_, idx) =>
            codeBlockLines.has(i - currentLines.length + idx)
          ),
        });
      }
      currentLevel = headingMatch[1].length;
      currentHeading = headingMatch[2];
      currentLines = [];
    } else {
      currentLines.push(lines[i]);
    }
  }

  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      headingLevel: currentLevel,
      content: currentLines.join("\n").trim(),
      pageNumber: null,
      hasTable: currentLines.join("\n").includes("|"),
      hasCode: currentLines.some((_, idx) =>
        codeBlockLines.has(lines.length - currentLines.length + idx)
      ),
    });
  }

  return {
    text: content,
    sections,
    metadata: {
      sourceFile: filePath,
      fileType: "md",
      pageCount: null,
      headings,
    },
  };
}

// ---------------------------------------------------------------------------
// Fallback text parser
// ---------------------------------------------------------------------------

async function parseTextFile(filePath: string): Promise<ParsedDocument> {
  const { readFileSync } = await import("node:fs");
  const content = readFileSync(filePath, "utf-8");

  return {
    text: content,
    sections: [
      {
        heading: "",
        headingLevel: 0,
        content,
        pageNumber: null,
        hasTable: false,
        hasCode: false,
      },
    ],
    metadata: {
      sourceFile: filePath,
      fileType: "txt",
      pageCount: null,
      headings: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Parser registry — extensible without modifying the router
// ---------------------------------------------------------------------------

class ParserRegistry {
  private parsers = new Map<FileType, ParserFn>();

  constructor() {
    // Register default parsers
    this.parsers.set("pdf", parsePdf);
    this.parsers.set("docx", parseDocx);
    this.parsers.set("md", parseMarkdown);
    this.parsers.set("txt", parseTextFile);
  }

  register(fileType: FileType, parser: ParserFn): void {
    this.parsers.set(fileType, parser);
  }

  get(fileType: FileType): ParserFn {
    return this.parsers.get(fileType) ?? parseTextFile;
  }

  async parse(filePath: string): Promise<ParsedDocument> {
    const fileType = detectFileType(filePath);
    const parser = this.get(fileType);
    return parser(filePath);
  }
}

// ---------------------------------------------------------------------------
// Usage example (commented out — this file is not meant to run)
// ---------------------------------------------------------------------------

async function main() {
  const registry = new ParserRegistry();

  // Register a custom parser for a new file type
  // registry.register("html", parseHtml);

  const files = [
    "/data/report.pdf",
    "/data/contract.docx",
    "/data/readme.md",
    "/data/notes.txt",
  ];

  for (const file of files) {
    const doc = await registry.parse(file);
    console.log(`[${doc.metadata.fileType}] ${file}`);
    console.log(`  Sections: ${doc.sections.length}`);
    console.log(`  Headings: ${doc.metadata.headings.join(" > ")}`);

    for (const section of doc.sections) {
      console.log(`  - ${"#".repeat(section.headingLevel)} ${section.heading}`);
    }
  }
}

// Uncomment to run: main().catch(console.error);

export { detectFileType, ParserRegistry };
export type { ParsedDocument, Section, FileType };

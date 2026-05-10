# Document Parsing Pipeline — Structured Learning Notes

## 1. PDF Parsing

### Libraries Overview

| Library | License | Based On | Bundle Size | Parse Speed | Table Support | Image Support |
|---|---|---|---|---|---|---|
| `unpdf` | MIT | PDF.js | ~1.5 MB | Fast | No (raw text) | No (metadata only) |
| `pdf-parse` | MIT | pdf.js (older) | ~1.2 MB | Moderate | No | No |

Both libraries ultimately wrap Mozilla's `pdf.js`. `unpdf` is the more modern, maintained wrapper with TypeScript support and a cleaner API.

### Using `unpdf`

```typescript
import { readFileSync } from "node:fs";
import { getDocument, extractText } from "unpdf";

async function parsePdfWithUnpdf(filePath: string) {
  const fileBuffer = readFileSync(filePath);
  const pdf = await getDocument(fileBuffer);

  // Extract text per page
  const { text, pages } = await extractText(pdf);

  // `text` — all text joined with newlines
  // `pages` — array of { pageNumber, content } with metadata

  const pageCount = pages.length;
  const allText = pages.map((p) => p.content).join("\n\n");

  return {
    text: allText,
    pageCount,
    pages: pages.map((p) => ({ pageNumber: p.pageNumber, content: p.content })),
  };
}
```

### Using `pdf-parse`

```typescript
import { readFileSync } from "node:fs";
import pdf from "pdf-parse";

async function parsePdfWithPdfParse(filePath: string) {
  const fileBuffer = readFileSync(filePath);
  const data = await pdf(fileBuffer);

  // `data.text` — full extracted text
  // `data.numpages` — page count
  // `data.info` — PDF metadata (title, author, etc.)

  return {
    text: data.text,
    pageCount: data.numpages,
    metadata: data.info,
  };
}
```

### Tables and Images — Limitations

PDF is a **presentation format**, not a structured data format. Tables are rendered as positioned text blocks with no column/row awareness. Both `unpdf` and `pdf-parse`:

- Return table content as **flattened text** (no grid structure)
- Cannot extract vector graphics or embedded images
- Lose multi-column layouts (text reads left-to-right across columns)

For table extraction from PDFs, dedicated tools are needed:

```typescript
// Tables require specialized post-processing or a library like `pdf-table-extractor`
// Example heuristic: detect repeated whitespace patterns
function detectTableLines(lines: string[]): string[][] {
  return lines
    .filter((line) => line.split(/\s{2,}/).length > 2)
    .map((line) => line.split(/\s{2,}/));
}
```

The same limitation applies to images — only metadata (dimensions, encoding) is available, not pixel data.

### Page Number Tracking

`unpdf` surfaces page numbers natively:

```typescript
const { pages } = await extractText(pdf);
for (const page of pages) {
  console.log(`Page ${page.pageNumber}: ${page.content.slice(0, 80)}...`);
}
```

`pdf-parse` does not expose per-page content. A workaround is to render each page separately:

```typescript
async function parseByPage(filePath: string) {
  const fileBuffer = readFileSync(filePath);
  const pdf = await getDocument(fileBuffer);

  const pageTexts: { pageNumber: number; content: string }[] = [];
  for (let i = 1; i <= pdf.totalPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push({
      pageNumber: i,
      content: content.items.map((item: any) => item.str).join(" "),
    });
  }
  return pageTexts;
}
```

---

## 2. Word (.docx) Parsing

### Library: `mammoth`

`mammoth` converts `.docx` files to HTML or plain text. It is **lossy** — complex layouts may not survive — but it captures the semantic structure (headings, lists, tables) better than any PDF parser.

```typescript
import { readFileSync } from "node:fs";
import mammoth from "mammoth";

async function parseDocx(filePath: string) {
  const buffer = readFileSync(filePath);

  // Option A: extract raw text
  const { value: text } = await mammoth.extractRawText({ buffer });

  // Option B: extract as HTML (preserves structure)
  const { value: html } = await mammoth.convertToHtml({ buffer });

  return { text, html };
}
```

### Extracting Headings with Hierarchy

`mammoth` maps Word heading styles (`Heading 1`, `Heading 2`, etc.) to HTML `<h1>`, `<h2>`, etc. A custom transform captures the hierarchy:

```typescript
interface DocxSection {
  heading: string;
  headingLevel: number;
  content: string;
}

async function parseDocxWithHeadings(filePath: string): Promise<DocxSection[]> {
  const buffer = readFileSync(filePath);
  const { value: html } = await mammoth.convertToHtml({ buffer });

  // Parse HTML to extract heading-anchored sections
  const sections: DocxSection[] = [];
  const headingRegex = /<(h[1-6])>([^<]+)<\/\1>/g;
  const parts = html.split(headingRegex);
  // parts: [before, tag, text, between, ...]

  // Simpler approach: split on heading tags
  const sectionBlocks = html.split(/(<(h[1-6])>.*?<\/\2>)/s);
  let currentHeading = "";
  let currentLevel = 0;
  let currentContent = "";

  for (const block of sectionBlocks) {
    const match = block.match(/<(h([1-6]))>(.*?)<\/\1>/);
    if (match) {
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          headingLevel: currentLevel,
          content: currentContent.trim(),
        });
      }
      currentHeading = match[3];
      currentLevel = parseInt(match[2], 10);
      currentContent = "";
    } else if (block.trim()) {
      // Strip HTML tags for plain text content
      currentContent += block.replace(/<[^>]*>/g, "").trim() + "\n";
    }
  }

  // Push last section
  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      headingLevel: currentLevel,
      content: currentContent.trim(),
    });
  }

  return sections;
}
```

### Table Handling

`mammoth` converts Word tables to HTML `<table>` elements. A post-processing step can extract them:

```typescript
async function parseDocxTables(filePath: string) {
  const buffer = readFileSync(filePath);
  const { value: html } = await mammoth.convertToHtml({ buffer });

  // Extract tables from HTML
  const tableRegex = /<table>[\s\S]*?<\/table>/g;
  const tables = html.match(tableRegex) ?? [];

  return tables.map((tableHtml, i) => {
    const rows = tableHtml.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    const cells = rows.map((row) => {
      const cols = row.match(/<td>[\s\S]*?<\/td>/g) ?? [];
      return cols.map((c) => c.replace(/<\/?td>/g, "").trim());
    });
    return { index: i, rows, cells };
  });
}
```

### Image Handling

`mammoth` can extract embedded images by providing a `convertImage` option:

```typescript
interface ExtractedImage {
  altText: string;
  contentType: string;
  data: Buffer;
}

async function parseDocxWithImages(filePath: string) {
  const buffer = readFileSync(filePath);
  const images: ExtractedImage[] = [];
  let imageIndex = 0;

  const { value: html } = await mammoth.convertToHtml({
    buffer,
    convertImage: mammoth.images.imgElement(async (image) => {
      const imageBuffer = await image.read();
      images.push({
        altText: image.altText ?? `image-${imageIndex}`,
        contentType: image.contentType,
        data: imageBuffer,
      });
      imageIndex++;
      return { src: `image-${imageIndex - 1}` };
    }),
  });

  return { html, images };
}
```

---

## 3. Markdown Parsing

### Option A: Plain Text + Regex (Lightweight)

For simple use cases where only heading hierarchy matters, a regex-based approach works without any dependencies:

```typescript
interface MarkdownSection {
  heading: string;
  headingLevel: number;
  content: string;
}

function parseMarkdownSimple(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = markdown.split("\n");
  let currentHeading = "root";
  let currentLevel = 0;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          headingLevel: currentLevel,
          content: currentContent.join("\n").trim(),
        });
      }
      currentLevel = headingMatch[1].length;
      currentHeading = headingMatch[2];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Push last section
  sections.push({
    heading: currentHeading,
    headingLevel: currentLevel,
    content: currentContent.join("\n").trim(),
  });

  return sections;
}
```

### Option B: `remark` / `unified` (AST-Based)

For full control (code blocks, links, images, tables), use the `unified` ecosystem:

```bash
bun add unified remark-parse remark-stringify remark-gfm mdast-util-from-markdown
```

```typescript
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root, Heading, Code, Link, Paragraph } from "mdast";

interface ParsedMarkdown {
  sections: SectionInfo[];
  codeBlocks: CodeBlockInfo[];
  links: LinkInfo[];
}

interface SectionInfo {
  heading: string;
  headingLevel: number;
  content: string;
}

interface CodeBlockInfo {
  language: string | null;
  code: string;
}

interface LinkInfo {
  text: string;
  url: string;
}

function parseMarkdownAst(markdown: string): ParsedMarkdown {
  const processor = unified().use(remarkParse);
  const tree = processor.parse(markdown);

  // Extract heading structure
  const sections: SectionInfo[] = [];
  const headings: Heading[] = [];

  visit(tree, "heading", (node: Heading) => {
    headings.push(node);
    const headingText = (node.children as Paragraph[])
      .map((child) => child.children?.[0]?.value ?? "")
      .join("");
    sections.push({
      heading: headingText,
      headingLevel: node.depth,
      content: "", // Requires walking children between headings
    });
  });

  // Extract code blocks
  const codeBlocks: CodeBlockInfo[] = [];
  visit(tree, "code", (node: Code) => {
    codeBlocks.push({
      language: node.lang ?? null,
      code: node.value,
    });
  });

  // Extract links
  const links: LinkInfo[] = [];
  visit(tree, "link", (node: Link) => {
    const linkText = (node.children as Paragraph[])
      .map((child) => child.children?.[0]?.value ?? node.url)
      .join("");
    links.push({ text: linkText, url: node.url });
  });

  return { sections, codeBlocks, links };
}
```

### Extracting Sections Between Headings (AST)

The AST walk does not automatically group content under headings. A more thorough approach uses the tree structure directly:

```typescript
function splitIntoSectionContent(markdown: string): SectionInfo[] {
  const processor = unified().use(remarkParse);
  const tree = processor.parse(markdown) as Root;
  const sections: SectionInfo[] = [];
  let currentSection: SectionInfo | null = null;
  let contentBuffer = "";

  for (const node of tree.children) {
    if (node.type === "heading") {
      if (currentSection) {
        currentSection.content = contentBuffer.trim();
        sections.push(currentSection);
      }
      const headingText = (node as Heading).children
        .map((child: any) => child.value ?? "")
        .join("");
      currentSection = {
        heading: headingText,
        headingLevel: (node as Heading).depth,
        content: "",
      };
      contentBuffer = "";
    } else if (currentSection) {
      // Serialize node back to markdown text for content
      const contentNode = node as any;
      if (contentNode.value) {
        contentBuffer += contentNode.value + "\n";
      } else if (contentNode.children) {
        contentBuffer +=
          contentNode.children
            .map((c: any) => c.value ?? "")
            .join("") + "\n";
      }
    }
  }

  if (currentSection) {
    currentSection.content = contentBuffer.trim();
    sections.push(currentSection);
  }

  return sections;
}
```

### Comparison: Regex vs. AST

| Aspect | Regex | remark/unified AST |
|---|---|---|
| Dependencies | None | `unified` + plugins (~200 KB) |
| Parse speed | Very fast (~1M chars/s) | Slower (~100K chars/s) |
| Accuracy on edge cases | Misses nested/weird syntax | Full spec compliance |
| Code block extraction | Custom logic needed | Built-in via `visit` |
| Link metadata | Regex for `[text](url)` | Built-in `link` node type |
| Heading hierarchy | Simple `#` count | Depth + nesting awareness |

**Recommendation**: Use regex for fast heading extraction and simple section splitting. Use `remark` when you need reliable code block detection, link extraction, or GFM table parsing.

---

## 4. Unified Parser Design

### Parser Interface

The unified output type that every parser implementation returns:

```typescript
interface ParsedDocument {
  text: string;                        // Full plain text
  sections: Section[];                 // Heading-anchored sections
  metadata: {
    sourceFile: string;
    fileType: "pdf" | "docx" | "md" | "txt";
    pageCount: number | null;          // null for non-paged formats
    headings: string[];                // Flat list of all headings
  };
}

interface Section {
  heading: string;
  headingLevel: number;
  content: string;
  pageNumber: number | null;           // null when page info unavailable
  hasTable: boolean;
  hasCode: boolean;
}
```

### File Router

The router examines the file extension and delegates to the appropriate parser:

```typescript
type FileType = "pdf" | "docx" | "md" | "txt";

type ParserFn = (filePath: string) => Promise<ParsedDocument>;

function detectFileType(filePath: string): FileType {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, FileType> = {
    pdf: "pdf",
    docx: "docx",
    md: "md",
    markdown: "md",
    txt: "txt",
    text: "txt",
  };
  if (ext in extMap) return extMap[ext];
  return "txt"; // fallback
}

async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const fileType = detectFileType(filePath);
  const parsers: Record<FileType, ParserFn> = {
    pdf: parsePdf,
    docx: parseDocx,
    md: parseMarkdown,
    txt: parseTextFile,
  };
  return parsers[fileType](filePath);
}

// Example text file parser (fallback)
async function parseTextFile(filePath: string): Promise<ParsedDocument> {
  const content = readFileSync(filePath, "utf-8");
  return {
    text: content,
    sections: [{ heading: "", headingLevel: 0, content, pageNumber: null, hasTable: false, hasCode: false }],
    metadata: {
      sourceFile: filePath,
      fileType: "txt",
      pageCount: null,
      headings: [],
    },
  };
}
```

### Section Detection by File Type

Each parser maps its native structure to the `Section` interface:

| File Type | Native Structure | Section Source | Page Number Source |
|---|---|---|---|
| PDF | Text blocks per page | Heuristic: detect all-caps/short lines as headings | Built-in via `unpdf` |
| DOCX | Word styles (Heading 1/2/3) | `mammoth` HTML heading tags | Not available |
| Markdown | `#` / `##` / `###` | Regex or remark AST | Not available |
| Plain text | Flat content | Single section | Not available |

### Putting It Together

```typescript
// Main entry point for the Notion AI ingestion pipeline
async function ingestFile(filePath: string): Promise<void> {
  const doc = await parseDocument(filePath);

  // 1. Chunk sections for embedding
  for (const section of doc.sections) {
    const chunk = {
      text: `# ${section.heading}\n\n${section.content}`,
      source: doc.metadata.sourceFile,
      pageNumber: section.pageNumber,
    };
    // embed(chunk)  — send to embedding API
    // store(chunk)  — save to vector DB
  }

  // 2. Store metadata for retrieval filtering
  await storeMetadata({
    fileName: doc.metadata.sourceFile,
    fileType: doc.metadata.fileType,
    headingCount: doc.metadata.headings.length,
    sectionCount: doc.sections.length,
    pageCount: doc.metadata.pageCount,
  });
}
```

### Design Considerations

1. **Graceful degradation**: If a parser cannot extract sections (e.g., a scanned PDF with no text layer), fall back to the text file handler with a single section.

2. **Streaming large documents**: For files >10 MB, consider streaming:
   ```typescript
   async function* parseDocumentStream(filePath: string): AsyncGenerator<Section> {
     // Yield sections one at a time instead of buffering the full document
   }
   ```

3. **Caching parsed output**: Serialize the `ParsedDocument` to a cache file (JSON or binary) to avoid re-parsing on repeated access:
   ```typescript
   const cachePath = filePath + ".parsed.json";
   if (existsSync(cachePath)) {
     return JSON.parse(readFileSync(cachePath, "utf-8"));
   }
   ```

4. **Parser registry pattern**: Keep the mapping of file types to parsers extensible via a registry:
   ```typescript
   class ParserRegistry {
     private parsers = new Map<FileType, ParserFn>();
     register(fileType: FileType, parser: ParserFn) {
       this.parsers.set(fileType, parser);
     }
     get(fileType: FileType): ParserFn {
       return this.parsers.get(fileType) ?? this.parsers.get("txt")!;
     }
   }
   ```

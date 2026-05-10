import mammoth from "mammoth";

export type FileType = "pdf" | "docx" | "md" | "txt";

export interface ParsedDocument {
  text: string;
  sections: { heading: string; headingLevel: number; content: string; pageNumber: number | null }[];
  metadata: { sourceFile: string; fileType: FileType };
}

export async function parseFile(buffer: ArrayBuffer, fileName: string): Promise<ParsedDocument> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "md" || ext === "txt") {
    const text = new TextDecoder().decode(buffer);
    return parsePlainText(text, fileName, ext as FileType);
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return parsePlainText(result.value, fileName, "docx");
  }

  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(Buffer.from(buffer));
    return parsePlainText(data.text, fileName, "pdf");
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

function parsePlainText(text: string, fileName: string, fileType: FileType): ParsedDocument {
  const lines = text.split("\n");
  const sections: ParsedDocument["sections"] = [];
  let currentHeading = "";
  let currentLevel = 0;
  let currentContent = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (currentContent.trim()) {
        sections.push({ heading: currentHeading, headingLevel: currentLevel, content: currentContent.trim(), pageNumber: null });
      }
      currentHeading = headingMatch[2];
      currentLevel = headingMatch[1].length;
      currentContent = "";
    } else {
      currentContent += line + "\n";
    }
  }
  if (currentContent.trim()) {
    sections.push({ heading: currentHeading, headingLevel: currentLevel, content: currentContent.trim(), pageNumber: null });
  }

  return { text, sections, metadata: { sourceFile: fileName, fileType } };
}

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const UPLOAD_DIR = resolve(import.meta.dir, "../../../uploads");

export async function fileReader(args: { filePath: string }): Promise<string> {
  try {
    const safePath = resolve(UPLOAD_DIR, args.filePath);
    if (!safePath.startsWith(UPLOAD_DIR)) {
      return "Error: path traversal not allowed.";
    }
    if (!existsSync(safePath)) {
      return `Error: file "${args.filePath}" not found.`;
    }
    const content = readFileSync(safePath, "utf-8");
    if (content.length > 10000) {
      return content.slice(0, 10000) + "\n\n[File truncated at 10000 characters]";
    }
    return content;
  } catch (err) {
    return `File read error: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

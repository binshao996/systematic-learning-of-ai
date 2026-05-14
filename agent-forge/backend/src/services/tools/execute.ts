import { webSearch } from "./web-search";
import { calculator } from "./calculator";
import { fileReader } from "./file-reader";

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

const handlers: Record<string, ToolHandler> = {
  web_search: (args) => webSearch(args as unknown as { query: string }),
  calculator: (args) => calculator(args as unknown as { expression: string }),
  file_reader: (args) => fileReader(args as unknown as { filePath: string }),
};

export async function executeTool(name: string, args: string): Promise<string> {
  const handler = handlers[name];
  if (!handler) return `Error: unknown tool "${name}".`;

  try {
    const parsed = JSON.parse(args);
    return await handler(parsed);
  } catch {
    return `Error: failed to parse arguments for tool "${name}".`;
  }
}

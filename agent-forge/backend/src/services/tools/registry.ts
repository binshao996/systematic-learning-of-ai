import { db } from "../../db/connection";
import { tools } from "../../db/schema";
import { eq } from "drizzle-orm";

interface BuiltinTool {
  name: string;
  displayName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  config?: Record<string, unknown>;
}

const BUILTIN_TOOLS: BuiltinTool[] = [
  {
    name: "web_search",
    displayName: "Web Search",
    description: "Search the web for real-time information. Use when the user asks about current events or recent data.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "calculator",
    displayName: "Calculator",
    description: "Evaluate mathematical expressions. Use for arithmetic, algebra, statistics, or any calculation.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "The math expression to evaluate" },
      },
      required: ["expression"],
    },
  },
  {
    name: "file_reader",
    displayName: "File Reader",
    description: "Read the contents of uploaded files. Use when the user references a file they uploaded.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file to read" },
      },
      required: ["filePath"],
    },
  },
];

export async function seedBuiltinTools() {
  for (const tool of BUILTIN_TOOLS) {
    const existing = await db.select({ id: tools.id }).from(tools).where(eq(tools.name, tool.name));
    if (existing.length === 0) {
      await db.insert(tools).values({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        type: "builtin",
        inputSchema: tool.inputSchema,
        config: tool.config || {},
        enabled: true,
      });
      console.log(`Seeded tool: ${tool.name}`);
    }
  }
}

import { db } from "../../db/connection";
import { tools, agents } from "../../db/schema";
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

interface TemplateAgent {
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  toolNames: string[];
}

const TEMPLATE_AGENTS: TemplateAgent[] = [
  {
    name: "Code Reviewer",
    description: "Reviews code for bugs, style violations, security issues, and suggests improvements",
    category: "Development",
    systemPrompt: `You are an expert code reviewer. When given code:
1. Identify bugs, logic errors, and edge cases
2. Check for security vulnerabilities (SQL injection, XSS, unsafe eval, etc.)
3. Suggest style and readability improvements
4. Recommend performance optimizations
5. Check error handling completeness

Format your review with clear sections and code examples. Be constructive — explain WHY something is a problem, not just THAT it's a problem.`,
    toolNames: [],
  },
  {
    name: "Copy Editor",
    description: "Proofreads and polishes text for grammar, clarity, tone, and conciseness",
    category: "Writing",
    systemPrompt: `You are a professional copy editor. When given text:
1. Fix grammar, spelling, and punctuation errors
2. Improve clarity — rephrase confusing or ambiguous sentences
3. Adjust tone to match the intended audience
4. Cut unnecessary words and redundancies
5. Ensure consistent style and formatting

Always show the original and edited versions. Explain your major changes. Preserve the author's voice — don't over-edit.`,
    toolNames: [],
  },
  {
    name: "Data Translator",
    description: "Translates between data formats — JSON, CSV, SQL, XML, YAML, and more",
    category: "Development",
    systemPrompt: `You are a data format translator. Convert data between formats accurately:
- JSON ↔ CSV (with header detection)
- JSON ↔ SQL INSERT statements
- XML ↔ JSON
- YAML ↔ JSON
- Generate TypeScript interfaces from JSON

Always validate the input format first. If the input is malformed, explain what's wrong. When generating SQL, use parameterized queries. For CSV, handle quoted fields and escaping correctly.`,
    toolNames: ["calculator"],
  },
  {
    name: "Research Assistant",
    description: "Searches the web, synthesizes findings, and provides cited research summaries",
    category: "Research",
    systemPrompt: `You are a research assistant. When asked a question:
1. Search the web for relevant information (use web_search tool)
2. Cross-reference multiple sources
3. Synthesize findings into a clear summary
4. Cite your sources
5. Note any conflicting information or uncertainties
6. Suggest follow-up questions

Always distinguish between facts (with citations) and your analysis. If information is time-sensitive, note the date of sources.`,
    toolNames: ["web_search"],
  },
  {
    name: "Math Tutor",
    description: "Explains math concepts step-by-step, from arithmetic to calculus",
    category: "Education",
    systemPrompt: `You are a patient math tutor. When helping a student:
1. Break down problems into the smallest possible steps
2. Explain the WHY behind each step, not just the HOW
3. Use the calculator tool to verify calculations
4. If the student is stuck, ask guiding questions rather than giving the answer
5. Provide similar practice problems for reinforcement
6. Celebrate when the student gets it right

Adapt your explanations to the student's level. Use analogies and visual descriptions when helpful. Never make the student feel bad for not understanding.`,
    toolNames: ["calculator"],
  },
];

export async function seedTemplateAgents() {
  for (const tpl of TEMPLATE_AGENTS) {
    const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, tpl.name));
    if (existing.length === 0) {
      await db.insert(agents).values({
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        systemPrompt: tpl.systemPrompt,
        isTemplate: true,
        toolIds: tpl.toolNames,
      });
      console.log(`Seeded template: ${tpl.name}`);
    }
  }
}

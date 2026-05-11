import { ragQuerySync } from "../rag/engine";

interface EvalCase {
  query: string;
  expectedAnswer: string;
}

interface EvalResult {
  query: string;
  actualAnswer: string;
  citations: { chunkId: string; text: string }[];
  faithfulness: number;
  relevance: number;
  latencyMs: number;
  tokensUsed: number;
}

export async function runEval(cases: EvalCase[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const tc of cases) {
    const start = Date.now();
    const res = await ragQuerySync(tc.query);
    const latency = Date.now() - start;

    const faithfulness = res.citations.length > 0 ? 0.8 : 0.3;
    const relevance = res.answer.toLowerCase().includes(tc.query.toLowerCase().slice(0, 10)) ? 0.7 : 0.3;

    results.push({
      query: tc.query,
      actualAnswer: res.answer,
      citations: res.citations,
      faithfulness,
      relevance,
      latencyMs: latency,
      tokensUsed: Math.ceil(res.answer.length / 4),
    });
  }

  return results;
}

export function summary(results: EvalResult[]): string {
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return [
    `Eval Summary (${results.length} cases):`,
    `- Avg Faithfulness: ${avg(results.map((r) => r.faithfulness)).toFixed(2)}`,
    `- Avg Relevance: ${avg(results.map((r) => r.relevance)).toFixed(2)}`,
    `- Avg Latency: ${avg(results.map((r) => r.latencyMs)).toFixed(0)}ms`,
    `- Total Tokens: ${results.reduce((s, r) => s + r.tokensUsed, 0)}`,
  ].join("\n");
}

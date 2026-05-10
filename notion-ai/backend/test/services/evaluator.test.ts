import { describe, it, expect } from "bun:test";
import { runEval, summary } from "../../src/services/eval/evaluator";

describe("Evaluator", () => {
  it("runEval returns results for test cases", async () => {
    const cases = [
      { query: "What is RAG?", expectedAnswer: "Retrieval Augmented Generation" },
      { query: "How does embedding work?", expectedAnswer: "Vectors represent text" },
    ];

    const results = await runEval(cases);

    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.query).toBeTruthy();
      expect(r.faithfulness).toBeGreaterThanOrEqual(0);
      expect(r.faithfulness).toBeLessThanOrEqual(1);
      expect(r.relevance).toBeGreaterThanOrEqual(0);
      expect(r.latencyMs).toBeGreaterThan(0);
    }
  });

  it("summary formats results as a string", () => {
    const results = [
      { query: "test", actualAnswer: "test answer", citations: [], faithfulness: 0.8, relevance: 0.7, latencyMs: 100, tokensUsed: 50 },
    ];
    const s = summary(results);
    expect(s).toContain("Eval Summary");
    expect(s).toContain("Faithfulness");
  });
});

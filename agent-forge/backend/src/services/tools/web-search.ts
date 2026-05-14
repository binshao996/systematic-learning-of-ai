export async function webSearch(args: { query: string }): Promise<string> {
  const query = encodeURIComponent(args.query);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: { "User-Agent": "AgentForge/1.0" },
    });
    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
    const html = await res.text();

    // Extract result snippets
    const snippets: string[] = [];
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = snippetRegex.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, "").trim();
      if (text) snippets.push(text);
    }

    if (snippets.length === 0) {
      return `No search results found for "${args.query}".`;
    }

    return snippets.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join("\n\n");
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

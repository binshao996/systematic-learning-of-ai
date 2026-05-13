/**
 * Convert a markdown string to HTML for TipTap insertion.
 * Handles common AI-generated markdown: headings, bold, italic, lists, code blocks, links.
 */
export function markdownToHtml(md: string): string {
  let text = md.trim();

  // 1. Extract fenced code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(
      `<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(code.trimEnd())}</code></pre>`
    );
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  // 2. Extract inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  // 3. Bold and italic (before other inline processing)
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>");

  // 4. Links and images
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // 5. Restore inline elements before block processing
  const restoreInlines = (s: string) =>
    s.replace(/\x00IC(\d+)\x00/g, (_, idx) => inlineCodes[parseInt(idx)]);

  text = restoreInlines(text);

  // 6. Process line by line for block-level elements
  const lines = text.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${headingMatch[2]}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push("<hr />");
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        bqLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(`<blockquote><p>${bqLines.join("<br>")}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      blocks.push("<ul>");
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        const content = lines[i].replace(/^[-*+]\s+/, "");
        blocks.push(`<li>${content}</li>`);
        i++;
      }
      blocks.push("</ul>");
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      blocks.push("<ol>");
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const content = lines[i].replace(/^\d+\.\s+/, "");
        blocks.push(`<li>${content}</li>`);
        i++;
      }
      blocks.push("</ol>");
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph — group consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p>${paraLines.join("<br>")}</p>`);
    }
  }

  let html = blocks.join("\n");

  // Restore code blocks
  html = html.replace(/\x00CB(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);

  return html;
}

function isBlockStart(line: string): boolean {
  return /^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|---|\*\*\*|___)/.test(line) || line.trim() === "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

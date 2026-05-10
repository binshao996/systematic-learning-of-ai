import type { Citation } from "@/types";

export function CitationLink({ citation }: { citation: Citation }) {
  return (
    <button className="text-xs text-blue-600 hover:underline block text-left">
      {citation.docTitle} — {citation.text.slice(0, 80)}...
    </button>
  );
}

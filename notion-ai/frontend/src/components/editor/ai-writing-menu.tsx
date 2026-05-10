"use client";
import { useState } from "react";
import { Sparkles, Languages, ListRestart, FileText } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const AI_ACTIONS = [
  { id: "continue", label: "Continue writing", icon: Sparkles },
  { id: "rewrite", label: "Rewrite professionally", icon: ListRestart },
  { id: "translate-zh", label: "Translate to Chinese", icon: Languages },
  { id: "translate-en", label: "Translate to English", icon: Languages },
  { id: "summarize", label: "Summarize", icon: FileText },
] as const;

export function AIWritingMenu({
  selectedText,
  onReplace,
  onClose,
}: {
  selectedText: string;
  onReplace: (text: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: string) => {
    setLoading(action);

    const res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[${action}] ${selectedText}`,
      }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") {
          try {
            const chunk = JSON.parse(line.slice(6)) as { choices: { delta: { content: string } }[] };
            result += chunk.choices[0]?.delta?.content ?? "";
          } catch {}
        }
      }
    }

    setLoading(null);
    onReplace(result);
    onClose();
  };

  return (
    <div className="absolute z-50 bg-white rounded-lg shadow-lg border p-1 min-w-[200px]">
      {AI_ACTIONS.map((action) => (
        <button
          key={action.id}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-zinc-100 rounded disabled:opacity-50"
          onClick={() => handleAction(action.id)}
          disabled={loading === action.id}
        >
          <action.icon className="h-4 w-4" />
          {loading === action.id ? "Processing..." : action.label}
        </button>
      ))}
    </div>
  );
}

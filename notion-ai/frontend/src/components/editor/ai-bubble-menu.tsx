"use client";
import { useState, useRef, useEffect } from "react";
import { Sparkles, Languages, Replace, ListRestart, FileText, ArrowUpDown, Smile, Plus } from "lucide-react";
import { markdownToHtml } from "@/lib/markdown";
import { streamSSEChat } from "@/lib/stream-client";

const AI_ACTIONS = [
  { id: "improve", label: "Improve writing", icon: Sparkles },
  { id: "rewrite", label: "Rewrite professionally", icon: ListRestart },
  { id: "summarize", label: "Summarize", icon: FileText },
  { id: "translate-zh", label: "Translate to Chinese", icon: Languages },
  { id: "translate-en", label: "Translate to English", icon: Languages },
  { id: "longer", label: "Make longer", icon: Plus },
  { id: "shorter", label: "Make shorter", icon: ArrowUpDown },
  { id: "tone", label: "Change tone", icon: Smile },
] as const;

interface AIBubbleMenuProps {
  selectedText: string;
  position: { top: number; left: number };
  onReplace: (text: string) => void;
  onInsertBelow: (text: string) => void;
  onClose: () => void;
}

export function AIBubbleMenu({
  selectedText,
  position,
  onReplace,
  onInsertBelow,
  onClose,
}: AIBubbleMenuProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [mode, setMode] = useState<"menu" | "streaming">("menu");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handleAction = async (actionId: string) => {
    setLoading(actionId);
    setMode("streaming");
    setStreamingText("");

    try {
      await streamSSEChat({
        message: `[${actionId}] ${selectedText}`,
        onChunk: (text) => setStreamingText(text),
      });
    } catch {
      // keep existing text on error
    }

    setLoading(null);
  };

  const cleanText = streamingText.replace(/\[chunk:[^\]]+\]/g, "").trim();

  const handleReplace = () => {
    onReplace(markdownToHtml(cleanText));
    onClose();
  };

  const handleInsertBelow = () => {
    onInsertBelow(markdownToHtml(cleanText));
    onClose();
  };

  // Calculate position to keep menu within viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(position.top, window.innerHeight - 400),
    left: Math.min(position.left, window.innerWidth - 280),
    zIndex: 50,
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      {mode === "menu" ? (
        <div className="bg-white rounded-lg shadow-lg border p-1 min-w-[220px]">
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-zinc-100 rounded disabled:opacity-50 text-left"
              onClick={() => handleAction(action.id)}
              disabled={loading === action.id}
            >
              <action.icon className="h-4 w-4 shrink-0 text-zinc-500" />
              {loading === action.id ? "Processing..." : action.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg border p-3 max-w-sm min-w-[260px]">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Sparkles className="h-4 w-4 animate-pulse text-blue-500" />
              Generating...
            </div>
          ) : (
            <>
              <div className="text-sm text-zinc-700 max-h-48 overflow-y-auto mb-3 prose prose-sm max-w-none prose-zinc">
                <div
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(streamingText) + (loading ? '<span class="inline-block w-1 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />' : ""),
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  onClick={handleReplace}
                  disabled={!streamingText || !!loading}
                >
                  <Replace className="h-3 w-3" />
                  Replace
                </button>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-zinc-50"
                  onClick={handleInsertBelow}
                  disabled={!streamingText || !!loading}
                >
                  Insert below
                </button>
                <button
                  className="ml-auto text-xs text-zinc-400 hover:text-zinc-600"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

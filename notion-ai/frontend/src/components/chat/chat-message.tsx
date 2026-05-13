import { CitationLink } from "./citation-link";
import type { ChatMessage as ChatMessageType } from "@/types";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useState } from "react";

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  return (
    <div className={`${message.role === "user" ? "text-right" : ""}`}>
      <div className={`inline-block rounded-lg px-3 py-2 text-sm max-w-full ${
        message.role === "user"
          ? "bg-blue-500 text-white"
          : "bg-zinc-100 text-zinc-900"
      }`}>
        <p className="whitespace-pre-wrap">{message.content || "..."}</p>
      </div>
      {message.citations.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {message.citations.map((c, i) => (
            <CitationLink key={i} citation={c} />
          ))}
        </div>
      )}
      {message.role === "assistant" && message.content && !feedback && (
        <div className="flex gap-1 mt-1">
          <button
            className="p-1 rounded hover:bg-zinc-200"
            onClick={() => {
              setFeedback("up");
              fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messageId: message.id, rating: "up" }),
              });
            }}
          >
            <ThumbsUp className="h-3 w-3 text-zinc-400" />
          </button>
          <button
            className="p-1 rounded hover:bg-zinc-200"
            onClick={() => {
              setFeedback("down");
              fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messageId: message.id, rating: "down" }),
              });
            }}
          >
            <ThumbsDown className="h-3 w-3 text-zinc-400" />
          </button>
        </div>
      )}
    </div>
  );
}

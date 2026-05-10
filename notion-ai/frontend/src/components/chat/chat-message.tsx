import { CitationLink } from "./citation-link";
import type { ChatMessage as ChatMessageType } from "@/types";

export function ChatMessage({ message }: { message: ChatMessageType }) {
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
    </div>
  );
}

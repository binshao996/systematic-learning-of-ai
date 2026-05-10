"use client";
import { useState } from "react";
import { useStreamingChat } from "@/hooks/use-streaming-chat";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

export function ChatPanel({ docId }: { docId: string }) {
  const { messages, isStreaming, sendMessage } = useStreamingChat(docId);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="w-80 border-l flex flex-col h-full bg-white">
      <div className="p-3 border-b font-medium text-sm">AI Chat</div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-zinc-400 text-center mt-8">
            Ask questions about this document
          </p>
        )}
      </div>
      <div className="p-3 border-t flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask about this doc..."
          className="flex-1 px-3 py-1.5 text-sm border rounded-md"
          disabled={isStreaming}
        />
        <Button size="icon" onClick={handleSend} disabled={isStreaming}>
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

import { useState, useCallback } from "react";
import type { ChatMessage } from "@/types";
import { streamSSEChat } from "@/lib/stream-client";

export function useStreamingChat(docId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      citations: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      await streamSSEChat({
        message: content,
        docId,
        onChunk: (_fullText, delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m
            )
          );
        },
      });
    } finally {
      setIsStreaming(false);
    }
  }, [docId]);

  return { messages, isStreaming, sendMessage };
}

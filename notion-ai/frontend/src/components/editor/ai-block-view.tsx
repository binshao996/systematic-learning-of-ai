"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Check, RotateCcw, Trash2, MessageSquare, Search, ExternalLink } from "lucide-react";
import { markdownToHtml } from "@/lib/markdown";
import { streamSSEChat } from "@/lib/stream-client";
import type { AIConversationEntry } from "@/extensions/ai-block";

export function AIBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const params = useParams();
  const docId = params.docId as string | undefined;
  const attrs = node.attrs as { mode: "write" | "qa"; state: string; conversation: AIConversationEntry[] };
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<AIConversationEntry[]>(attrs.conversation ?? []);
  const [state, setState] = useState<string>(attrs.state ?? "input");
  const [streamingText, setStreamingText] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep attrs in sync
  useEffect(() => {
    setConversation(attrs.conversation ?? []);
    setState(attrs.state ?? "input");
  }, [attrs.conversation, attrs.state]);

  // Focus input when entering input state (use rAF to ensure DOM is ready after NodeView render)
  useEffect(() => {
    if (state === "input") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      });
    }
  }, [state]);

  const streamResponse = useCallback(async (messages: AIConversationEntry[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    setStreamingText("");
    updateAttributes({ state: "loading", conversation: messages });

    try {
      const fullText = await streamSSEChat({
        message: messages.filter((m) => m.role === "user").pop()?.content ?? "",
        docId: attrs.mode === "qa" ? undefined : docId,
        signal: controller.signal,
        onChunk: (text) => setStreamingText(text),
      });

      const cleanedText = fullText.replace(/\[chunk:[^\]]+\]/g, "").trim();

      const finalMessages: AIConversationEntry[] = [
        ...messages,
        { role: "assistant" as const, content: cleanedText, citations: [] },
      ];
      setConversation(finalMessages);
      setState("done");
      setStreamingText("");
      updateAttributes({ state: "done", conversation: finalMessages });
    } catch {
      setState("error");
      updateAttributes({ state: "error" });
    }
  }, [attrs.mode, docId, updateAttributes]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || state === "loading") return;
    const updated = [...conversation, { role: "user" as const, content: input.trim() }];
    setConversation(updated);
    setInput("");
    streamResponse(updated);
  }, [input, state, conversation, streamResponse]);

  const handleRetry = useCallback(() => {
    const msgs = conversation.slice(0, -1); // remove last assistant response
    setConversation(msgs);
    streamResponse(msgs);
  }, [conversation, streamResponse]);

  const handleDiscard = useCallback(() => {
    const pos = getPos();
    if (pos !== undefined && pos !== null) {
      editor.chain().focus().deleteRange({ from: pos, to: pos + (node.nodeSize ?? 1) }).run();
    }
  }, [editor, getPos, node.nodeSize]);

  const handleKeep = useCallback(() => {
    const lastAssistant = [...conversation].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const pos = getPos();
    if (pos !== undefined && pos !== null) {
      const html = markdownToHtml(lastAssistant.content);
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + (node.nodeSize ?? 1) })
        .insertContentAt(pos, html)
        .run();
    }
  }, [editor, getPos, node.nodeSize, conversation]);

  const handleContinue = useCallback(() => {
    setState("input");
    updateAttributes({ state: "input", conversation });
  }, [conversation, updateAttributes]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <NodeViewWrapper data-ai-block="">
      <div className="ai-block my-4 bg-blue-50/50 border border-blue-100 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-100 bg-blue-50">
          <div className="flex items-center gap-1.5">
            {attrs.mode === "qa" ? (
              <Search className="h-3.5 w-3.5 text-blue-500" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            )}
            <span className="text-xs font-medium text-blue-600">
              {attrs.mode === "qa" ? "Ask AI" : "AI Write"}
            </span>
          </div>
        </div>

        {/* Conversation history */}
        <div className="px-4 py-3 space-y-3">
          {conversation.map((msg, i) => (
            <div key={i} className={`text-sm ${msg.role === "user" ? "text-blue-700" : "text-zinc-700"}`}>
              {msg.role === "user" ? (
                <p className="flex items-start gap-2">
                  <span className="font-medium shrink-0">You:</span>
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </p>
              ) : (
                <div>
                  <div
                    className="prose prose-sm max-w-none prose-zinc"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        ? markdownToHtml(msg.content)
                        : state === "loading" && i === conversation.length - 1
                          ? "..."
                          : "",
                    }}
                  />
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.citations.map((c, ci) => (
                        <a
                          key={ci}
                          href={`/${c.docId}`}
                          className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {c.docTitle}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Streaming text */}
          {state === "loading" && streamingText && (
            <div className="text-sm text-zinc-700">
              <div
                className="prose prose-sm max-w-none prose-zinc"
                dangerouslySetInnerHTML={{
                  __html: markdownToHtml(streamingText) + '<span class="inline-block w-1 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />',
                }}
              />
            </div>
          )}

          {/* Loading indicator when no streaming text yet */}
          {state === "loading" && !streamingText && (
            <div className="flex items-center gap-1 px-1">
              <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          )}

          {/* Error state */}
          {state === "error" && (
            <div className="text-sm text-red-500">
              Something went wrong.
              <button className="ml-2 underline" onClick={handleRetry}>
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Input area */}
        {state === "input" && (
          <div className="px-4 pb-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder={
                  attrs.mode === "qa"
                    ? "Ask AI about your knowledge base..."
                    : "What do you want to write?"
                }
                rows={2}
                className="flex-1 px-3 py-2 text-sm border border-blue-200 rounded-md resize-none outline-none focus:border-blue-400 bg-white"
              />
              <Button
                size="icon"
                className="shrink-0"
                onClick={handleSubmit}
                disabled={!input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {conversation.length > 0 && (
              <p className="text-xs text-zinc-400 mt-1.5">
                Follow-up question about this response
              </p>
            )}
          </div>
        )}

        {/* Action bar (done state) */}
        {state === "done" && (
          <div className="flex items-center gap-1 px-4 py-2 border-t border-blue-100 bg-blue-50/50">
            <Button variant="ghost" size="sm" onClick={handleKeep} className="text-xs h-7">
              <Check className="h-3 w-3 mr-1" />
              Keep
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRetry} className="text-xs h-7">
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDiscard} className="text-xs h-7">
              <Trash2 className="h-3 w-3 mr-1" />
              Discard
            </Button>
            <Button variant="ghost" size="sm" onClick={handleContinue} className="text-xs h-7 ml-auto">
              <MessageSquare className="h-3 w-3 mr-1" />
              Continue
            </Button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

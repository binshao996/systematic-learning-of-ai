"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Square, Loader2, Wrench, Brain, MessageSquare, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useAgentRun, Conversation } from "@/hooks/use-agent-run";
import { TraceEvent } from "@/types";
import { MarkdownContent } from "@/components/markdown-content";

function ThinkingCard({ event, done }: { event: TraceEvent; done: boolean }) {
  const [collapsed, setCollapsed] = useState(done);

  useEffect(() => {
    setCollapsed(done);
  }, [done]);

  const content = event.content || "";

  return (
    <div className="my-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-700 w-full text-left py-1 group"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">Thinking</span>
        {collapsed && (
          <span className="text-zinc-400 truncate flex-1">
            &mdash; {content.slice(0, 80).replace(/\n/g, " ")}{content.length > 80 ? "..." : ""}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="ml-5 mt-1 pl-3 border-l-2 border-purple-200">
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  );
}

function EventCard({ event, done }: { event: TraceEvent; done: boolean }) {
  switch (event.type) {
    case "agent_start":
      return (
        <div className="text-xs text-zinc-400 italic py-1">
          Agent started
        </div>
      );
    case "thinking":
      return <ThinkingCard event={event} done={done} />;
    case "tool_call":
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 my-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1">
            <Wrench className="h-3.5 w-3.5" />
            Tool: {event.toolName}
          </div>
          <pre className="text-xs text-amber-800 whitespace-pre-wrap font-mono">
            {typeof event.toolInput === "string" ? event.toolInput : JSON.stringify(event.toolInput, null, 2)}
          </pre>
        </div>
      );
    case "tool_result":
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 my-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-1">
            Result{event.latencyMs ? ` (${event.latencyMs}ms)` : ""}
          </div>
          <pre className="text-xs text-green-800 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
            {event.toolOutput}
          </pre>
        </div>
      );
    case "agent_output":
      return (
        <div className="flex gap-2 py-1">
          <MessageSquare className="h-4 w-4 shrink-0 mt-1 text-blue-400" />
          <div className="flex-1 min-w-0">
            <MarkdownContent content={event.content || ""} />
          </div>
        </div>
      );
    case "user_message" as never:
      return (
        <div className="flex gap-2 py-1 justify-end">
          <div className="bg-zinc-100 rounded-lg px-3 py-2 max-w-[85%]">
            <p className="text-sm text-zinc-800 whitespace-pre-wrap">{event.content}</p>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function TestChat({ agentId }: { agentId: string }) {
  const [input, setInput] = useState("");
  const { running, events, done, error, conversationId, run, stop, reset, loadConversations, loadHistory, loadHistoryIntoState } = useAgentRun();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  useEffect(() => {
    loadConversations(agentId).then(setConvs);
  }, [agentId, events, done]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || running) return;
    run(agentId, input.trim(), conversationId || undefined);
    setInput("");
    // Refresh conversation list after new conversation created
    setTimeout(() => loadConversations(agentId).then(setConvs), 500);
  };

  const handleNewChat = () => {
    reset();
  };

  const handleSelectConversation = async (conv: Conversation) => {
    setLoadingChat(true);
    const history = await loadHistory(agentId, conv.id);
    loadHistoryIntoState(history, conv.id);
    setLoadingChat(false);
  };

  return (
    <div className="border rounded-xl bg-white flex h-[600px]">
      {/* Conversation Sidebar */}
      <div className="w-56 border-r shrink-0 flex flex-col bg-zinc-50 rounded-l-xl">
        <div className="px-3 py-3 border-b">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900 py-1"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {convs.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className={`w-full text-left px-2 py-2 rounded-lg text-xs transition-colors truncate block ${
                conv.id === conversationId
                  ? "bg-zinc-200 text-zinc-900 font-medium"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {conv.title || "New Chat"}
            </button>
          ))}
          {convs.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">No conversations</p>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="font-semibold text-sm">Test Chat</h3>
          {running && (
            <button onClick={stop} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
              <Square className="h-3 w-3" /> Stop
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {loadingChat ? (
            <p className="text-sm text-zinc-400 text-center pt-20">Loading...</p>
          ) : events.length === 0 && !running && !error ? (
            <p className="text-sm text-zinc-400 text-center pt-20">
              Send a message to test this agent.
            </p>
          ) : (
            events.map((event, i) => (
              <EventCard key={i} event={event} done={done} />
            ))
          )}
          {running && (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t px-3 py-2 flex gap-2 shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            disabled={running}
          />
          <button
            type="submit"
            disabled={!input.trim() || running}
            className="bg-zinc-900 text-white rounded-lg px-3 py-2 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}


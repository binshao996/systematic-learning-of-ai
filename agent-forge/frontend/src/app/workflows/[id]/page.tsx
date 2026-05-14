"use client";
import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { AgentNode } from "@/components/workflow/agent-node";
import { StartNode } from "@/components/workflow/StartNode";
import { EndNode } from "@/components/workflow/EndNode";
import { CodeNode } from "@/components/workflow/CodeNode";
import { AgentPanel } from "@/components/workflow/agent-panel";
import { WorkflowToolbar } from "@/components/workflow/workflow-toolbar";
import { RunConsole } from "@/components/workflow/run-console";
import { useWorkflowRun } from "@/hooks/use-workflow-run";
import { Workflow, Agent } from "@/types";
import { apiFetch } from "@/lib/api-client";

const nodeTypes = {
  startNode: StartNode,
  endNode: EndNode,
  agentNode: AgentNode,
  codeNode: CodeNode,
};

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [name, setName] = useState("Untitled");
  const [saving, setSaving] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const { running, events, error, done, currentNodeId, run, stop } = useWorkflowRun();

  // Mark running/completed nodes
  const activeNodes = nodes.map((n) => {
    const isRunning = running && (
      n.data.agentId === currentNodeId || n.id === currentNodeId
    );
    const isCompleted = done || events.some(
      (e) => (e.type === "agent_output" || e.type === "node_output") &&
        (e.agentId === n.data.agentId || e.agentId === n.id)
    );
    return { ...n, data: { ...n.data, isRunning, isCompleted } };
  });

  // Load workflow
  useEffect(() => {
    if (id === "new") { setLoaded(true); return; }
    apiFetch<Workflow>(`/api/workflows/${id}`)
      .then((wf) => {
        setName(wf.name);
        const typeToNodeType: Record<string, string> = {
          start: "startNode",
          end: "endNode",
          agent: "agentNode",
          code: "codeNode",
        };
        const loadedNodes = (wf.nodes || []).map((n) => ({
          id: n.id,
          type: typeToNodeType[n.type] || "agentNode",
          position: n.position,
          data: {
            label: n.label,
            agentName: "",
            agentId: n.agentId || "",
            content: n.content || "",
          },
        }));
        const loadedEdges = (wf.edges || []).map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label || (e.condition ? `if: ${(e.condition as Record<string,unknown>).keyword || ""}` : ""),
          animated: !!e.condition,
          style: e.condition ? { stroke: "#f59e0b" } : undefined,
        }));
        // Resolve agent names only for agent nodes
        const agentNodeIds = loadedNodes.filter((n) => n.type === "agentNode" && n.data.agentId);
        if (agentNodeIds.length > 0) {
          apiFetch<Agent[]>("/api/agents").then((agents) => {
            const map = new Map(agents.map((a) => [a.id, a.name]));
            setNodes(loadedNodes.map((n) => {
              if (n.type === "agentNode") {
                return { ...n, data: { ...n.data, agentName: map.get(n.data.agentId) || "Unknown" } };
              }
              return n;
            }));
          }).catch(() => setNodes(loadedNodes));
        } else {
          setNodes(loadedNodes);
        }
        setEdges(loadedEdges);
      })
      .catch(() => toast.error("Workflow not found"))
      .finally(() => setLoaded(true));
  }, [id]);

  // Drag and drop agent onto canvas
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!rfInstance || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.project({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });
      const nodeId = `node_${Date.now()}`;

      // Agent drop
      const agentRaw = e.dataTransfer.getData("application/agent");
      if (agentRaw) {
        const agent: Agent = JSON.parse(agentRaw);
        setNodes((nds) => [
          ...nds,
          {
            id: nodeId,
            type: "agentNode",
            position,
            data: { label: agent.name, agentName: agent.name, agentId: agent.id },
          },
        ]);
        return;
      }

      // Generic node type drop (start/end/code)
      const nodeType = e.dataTransfer.getData("application/nodetype") as "start" | "end" | "code" | "";
      if (nodeType) {
        const labels: Record<string, string> = { start: "Start", end: "End", code: "Code" };
        const nodeTypeMap: Record<string, string> = { start: "startNode", end: "endNode", code: "codeNode" };
        setNodes((nds) => [
          ...nds,
          {
            id: nodeId,
            type: nodeTypeMap[nodeType],
            position,
            data: { label: labels[nodeType] },
          },
        ]);
      }
    },
    [rfInstance]
  );

  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge({ ...conn, animated: false }, eds)),
    []
  );

  // Save
  const handleSave = async () => {
    if (!rfInstance) return;
    setSaving(true);
    const nodeTypeToType: Record<string, string> = {
      startNode: "start",
      endNode: "end",
      agentNode: "agent",
      codeNode: "code",
    };
    const flowNodes = nodes.map((n) => ({
      id: n.id,
      type: nodeTypeToType[n.type || "agentNode"] || "agent",
      agentId: n.data.agentId || undefined,
      label: n.data.label,
      position: n.position,
      content: n.data.content || undefined,
    }));
    const flowEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
    }));
    try {
      if (id === "new") {
        const created = await apiFetch<Workflow>("/api/workflows", {
          method: "POST",
          body: JSON.stringify({ name, nodes: flowNodes, edges: flowEdges }),
        });
        toast.success("Workflow created");
        router.replace(`/workflows/${created.id}`);
      } else {
        await apiFetch(`/api/workflows/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, nodes: flowNodes, edges: flowEdges }),
        });
        toast.success("Workflow saved");
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = () => {
    if (!runInput.trim()) return;
    const wfId = id === "new" ? null : id;
    if (!wfId) {
      toast.error("Save the workflow first");
      return;
    }
    run(wfId, runInput.trim());
  };

  if (!loaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50">
        <p className="text-zinc-400 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50">
      <WorkflowToolbar
        name={name}
        onNameChange={setName}
        onSave={handleSave}
        onRun={handleRun}
        onStop={stop}
        running={running}
        saving={saving}
      />

      <div className="flex-1 flex min-h-0">
        <AgentPanel />

        <div className="flex-1 min-w-0" ref={reactFlowWrapper}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={activeNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setRfInstance}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Controls />
              <MiniMap
                nodeColor={(n) => (n.data.isRunning ? "#f59e0b" : n.data.isCompleted ? "#22c55e" : "#e4e4e7")}
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <RunConsole
          events={events}
          running={running}
          error={error}
          input={runInput}
          onInputChange={setRunInput}
          onRun={handleRun}
          onStop={stop}
        />
      </div>
    </div>
  );
}

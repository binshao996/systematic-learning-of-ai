"use client";
import { useEffect, useState } from "react";
import { DocTreeItem } from "./doc-tree-item";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { Doc } from "@/types";

export function DocTree() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = () => {
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents`)
      .then((r) => r.json())
      .then((data) => setDocs(data))
      .catch(() => toast.error("Failed to load documents"))
      .finally(() => setLoading(false));
  };

  const refresh = () => fetchDocs();

  if (loading) {
    return (
      <div className="space-y-1.5 p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-4"
            style={{ width: `${60 + Math.random() * 35}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {docs.length === 0 ? (
        <div className="text-center text-sm text-zinc-400 py-8 px-2">
          <p>No documents yet</p>
          <p className="mt-1">Create one or upload a file</p>
        </div>
      ) : (
        docs.map((doc) => (
          <DocTreeItem key={doc.id} doc={doc} level={0} onUpdate={refresh} />
        ))
      )}
    </div>
  );
}

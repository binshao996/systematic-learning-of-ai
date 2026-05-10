"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Doc } from "@/types";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

export function DocTreeItem({ doc, level, onUpdate }: { doc: Doc; level: number; onUpdate: () => void }) {
  const params = useParams();
  const isActive = params.docId === doc.id;

  return (
    <>
      <Link
        href={`/${doc.id}`}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-sm hover:bg-zinc-200 transition-colors",
          isActive && "bg-zinc-200 font-medium"
        )}
        style={{ paddingLeft: `${8 + level * 12}px` }}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="truncate">{doc.title || "Untitled"}</span>
      </Link>
    </>
  );
}

"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Doc } from "@/types";
import { cn } from "@/lib/utils";
import { FileText, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function DocTreeItem({ doc, level, onUpdate }: { doc: Doc; level: number; onUpdate: () => void }) {
  const params = useParams();
  const router = useRouter();
  const isActive = params.docId === doc.id;
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleDelete = async () => {
    try {
      const res = await fetch(`${API_URL}/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Document deleted");
      if (isActive) router.push("/");
      onUpdate();
    } catch {
      toast.error("Failed to delete document");
    }
    setMenuOpen(false);
  };

  return (
    <div
      className={cn(
        "relative group flex items-center rounded text-sm transition-colors pr-1",
        hovered && !isActive && "bg-zinc-200",
        isActive && "bg-zinc-200 font-medium"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href={`/${doc.id}`}
        className="flex-1 flex items-center gap-1.5 px-2 py-1 min-w-0"
        style={{ paddingLeft: `${8 + level * 12}px` }}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="truncate">{doc.title || "Untitled"}</span>
      </Link>
      {hovered && (
        <button
          className="shrink-0 p-0.5 rounded text-zinc-400 hover:text-zinc-600"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      )}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 bg-white rounded-md shadow-lg border py-1 min-w-[120px]"
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 text-left"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

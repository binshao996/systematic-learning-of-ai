import { CommandItem } from "@/components/ui/command";
import type { SearchResult } from "@/types";
import { FileText } from "lucide-react";

export function SearchResultItem({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: () => void;
}) {
  return (
    <CommandItem onSelect={onSelect} className="flex items-start gap-2 py-2">
      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-zinc-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.docTitle}</p>
        <p className="text-xs text-zinc-500 line-clamp-2">{result.text}</p>
      </div>
      <span className="text-xs text-zinc-400">{Math.round(result.score * 100)}%</span>
    </CommandItem>
  );
}

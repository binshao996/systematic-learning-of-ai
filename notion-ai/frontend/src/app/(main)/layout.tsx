"use client";
import { DocTree } from "@/components/sidebar/doc-tree";
import { NewDocButton } from "@/components/sidebar/new-doc-button";
import { UploadDialog } from "@/components/upload/upload-dialog";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
    <aside className="w-64 border-r bg-zinc-50 flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b flex items-center justify-between">
        <h1 className="font-semibold text-sm">bin notion</h1>
        <div className="flex items-center gap-1">
          <UploadDialog />
          <NewDocButton />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <DocTree />
      </div>
    </aside>
    <main className="flex-1 overflow-hidden">{children}</main>
  </div>
  );
}

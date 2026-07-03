"use client";

import { BookOpen, Plus, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CreateScriptDialog } from "@/components/dashboard/create-script-dialog";

export function EmptyState({
  projectId,
  projectName,
  showCreateDialog,
  onShowCreateDialog,
  onCreated,
  onParseScript,
}: {
  projectId: number;
  projectName?: string;
  showCreateDialog: boolean;
  onShowCreateDialog: (show: boolean) => void;
  onCreated: () => void;
  onParseScript: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center py-20"
      >
        <div className="h-20 w-20 rounded-2xl bg-linear-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10 flex items-center justify-center mb-6 border border-purple-500/10">
          <BookOpen className="h-10 w-10 text-purple-400/60" />
        </div>
        <h2 className="text-xl font-semibold mb-2">还没有剧本</h2>
        <p className="text-muted-foreground text-sm mb-6 max-w-md text-center">
          手动创建空白剧本并编辑，或粘贴剧本原文让 AI 自动解析为结构化数据
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onShowCreateDialog(true)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium",
              "bg-primary text-primary-foreground",
              "hover:opacity-90 hover:scale-[1.02]",
              "active:scale-[0.98] transition-all duration-200"
            )}
          >
            <Plus className="h-4 w-4" />
            手动创建
          </button>
          <button
            onClick={onParseScript}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium",
              "bg-linear-to-r from-purple-600 to-pink-600",
              "text-white shadow-lg shadow-purple-500/20",
              "hover:shadow-purple-500/30 hover:scale-[1.02]",
              "active:scale-[0.98] transition-all duration-200"
            )}
          >
            <Sparkles className="h-4 w-4" />
            AI 生成剧本
          </button>
        </div>
      </motion.div>
      <CreateScriptDialog
        open={showCreateDialog}
        projectId={projectId}
        projectName={projectName}
        onClose={() => onShowCreateDialog(false)}
        onCreated={onCreated}
      />
    </>
  );
}

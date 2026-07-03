"use client";

import { ZoomIn, ZoomOut, Maximize2, LayoutGrid, Maximize } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface CanvasToolbarProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  onAutoLayout?: () => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Toolbar button items                                                */
/* ------------------------------------------------------------------ */

interface ToolbarItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}


/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CanvasToolbar({
  onZoomIn,
  onZoomOut,
  onFitView,
  onAutoLayout,
  className,
}: CanvasToolbarProps) {
  const rf = useReactFlow();
  const handleZoomIn = onZoomIn ?? (() => rf.zoomIn());
  const handleZoomOut = onZoomOut ?? (() => rf.zoomOut());
  const handleFitView = onFitView ?? (() => rf.fitView());

  const items: ToolbarItem[] = [
    { icon: ZoomIn, label: "放大", onClick: handleZoomIn },
    { icon: ZoomOut, label: "缩小", onClick: handleZoomOut },
    { icon: Maximize2, label: "适应视图", onClick: handleFitView },
    { icon: LayoutGrid, label: "自动布局", onClick: onAutoLayout ?? (() => {}) },
  ];

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 flex flex-col gap-1",
        "rounded-xl border border-zinc-700/50 bg-zinc-900/80 p-1.5 shadow-xl backdrop-blur-md",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            title={item.label}
            onClick={item.onClick}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400",
              "transition-colors hover:bg-zinc-700/60 hover:text-zinc-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

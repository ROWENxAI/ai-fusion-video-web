"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Wand2, Video, PlayCircle, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/api/client";
import { SafeImage } from "@/components/ui/safe-image";

/* ------------------------------------------------------------------ */
/*  Data interface exported for the canvas to consume                  */
/* ------------------------------------------------------------------ */

export interface StoryboardNodeData {
  /** Unique storyboard item id */
  itemId: number;
  /** Shot description text */
  shotDescription?: string;
  /** Dialogue / narration */
  dialogue?: string;
  /** Camera framing label, e.g. 中景, 近景 */
  framing?: string;
  /** Camera movement label, e.g. 推, 拉, 摇 */
  cameraMove?: string;
  /** Duration in seconds */
  duration?: number;
  /** Frame image URL (may be relative) */
  frameUrl?: string;
  /** Video clip URL (may be relative) */
  videoUrl?: string;
  /** Generation status */
  status?: "generated" | "has_frame" | "pending";
  /** Frame type */
  frameType?: string;
  /** Whether this node is selected */
  selected?: boolean;

  /* callbacks wired from parent */
  onVideoGen?: (itemId: number) => void;
  onFrameGen?: (itemId: number, type?: string) => void;
  onPlay?: (itemId: number) => void;
  onSelectItem?: (itemId: number) => void;
  onSelect?: (id: number) => void;
  label?: string;
  sceneId?: number;
  episodeId?: number;
  shotType?: string;
}

/* ------------------------------------------------------------------ */
/*  Status badge helpers                                               */
/* ------------------------------------------------------------------ */

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  generated: {
    label: "已生成",
    className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
  has_frame: {
    label: "有配图",
    className: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  },
  pending: {
    label: "待生成",
    className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  },
};

const frameTypeConfig: Record<
  string,
  { label: string; className: string }
> = {
  first: {
    label: "首帧",
    className: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  },
  last: {
    label: "尾帧",
    className: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  },
  keyframe: {
    label: "关键帧",
    className: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function StoryboardNodeInner({ data }: NodeProps) {
  const d = data as unknown as StoryboardNodeData;

  const mediaSrc = d.frameUrl
    ? resolveMediaUrl(d.frameUrl)
    : d.videoUrl
    ? resolveMediaUrl(d.videoUrl)
    : undefined;

  const status = statusConfig[d.status ?? "pending"] ?? statusConfig.pending;
  const fType = d.frameType ? frameTypeConfig[d.frameType] : undefined;

  return (
    <div
      className={cn(
        "w-[220px] rounded-xl border border-zinc-700/60 bg-zinc-900/90 shadow-lg",
        "transition-shadow hover:shadow-xl",
        d.selected && "ring-2 ring-primary ring-offset-1 ring-offset-zinc-950"
      )}
      onClick={() => d.onSelectItem?.(d.itemId)}
    >
      {/* ---- Media area ---- */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-zinc-800">
        {mediaSrc ? (
          <SafeImage
            src={mediaSrc}
            alt={d.shotDescription ?? "storyboard frame"}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-8 w-8 text-zinc-600" />
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
              status.className
            )}
          >
            {status.label}
          </span>
          {fType && (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                fType.className
              )}
            >
              {fType.label}
            </span>
          )}
        </div>

        {/* Duration badge */}
        {d.duration != null && (
          <span className="absolute bottom-1 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-200">
            {d.duration.toFixed(1)}s
          </span>
        )}
      </div>

      {/* ---- Content area ---- */}
      <div className="space-y-1 p-2.5">
        {d.shotDescription && (
          <p className="line-clamp-2 text-xs leading-snug text-zinc-200">
            {d.shotDescription}
          </p>
        )}
        {d.dialogue && (
          <p className="line-clamp-2 text-[11px] leading-snug text-zinc-400 italic">
            {d.dialogue}
          </p>
        )}
        {(d.framing || d.cameraMove) && (
          <p className="text-[10px] text-zinc-500">
            {[d.framing, d.cameraMove].filter(Boolean).join(" \u00b7 ")}
          </p>
        )}
      </div>

      {/* ---- Hover action buttons ---- */}
      <div
        className={cn(
          "flex items-center justify-end gap-1 border-t border-zinc-700/40 px-2 py-1.5",
          "opacity-0 transition-opacity group-hover:opacity-100",
          /* always visible on touch / selected */ d.selected && "opacity-100"
        )}
      >
        <button
          type="button"
          title="\u751f\u6210\u914d\u56fe"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-100"
          onClick={(e) => {
            e.stopPropagation();
            d.onFrameGen?.(d.itemId);
          }}
        >
          <Wand2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="\u751f\u6210\u89c6\u9891"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-100"
          onClick={(e) => {
            e.stopPropagation();
            d.onVideoGen?.(d.itemId);
          }}
        >
          <Video className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="\u64ad\u653e"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-100"
          onClick={(e) => {
            e.stopPropagation();
            d.onPlay?.(d.itemId);
          }}
        >
          <PlayCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ---- React Flow handles ---- */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-zinc-500 !bg-zinc-800"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-zinc-500 !bg-zinc-800"
      />
    </div>
  );
}

const StoryboardNode = memo(StoryboardNodeInner);
export { StoryboardNode };

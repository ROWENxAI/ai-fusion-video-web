"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StoryboardNode, type StoryboardNodeData } from "./storyboard-node";
import { CanvasToolbar } from "./canvas-toolbar";

const nodeTypes = { storyboard: StoryboardNode };

interface SceneGroup {
  scene: { id: number; sceneNumber?: number; location?: string; episodeId?: number };
  items: Array<{
    id: number;
    sceneId?: number;
    episodeId?: number;
    shotDescription?: string;
    dialogueText?: string;
    frameUrl?: string;
    videoUrl?: string;
    duration?: number;
    cameraMove?: string;
    shotType?: string;
    frameType?: string;
    sortOrder?: number;
  }>;
}

interface Props {
  sceneGroups: SceneGroup[];
  selectedItemId: number | null;
  onSelectItem: (id: number) => void;
  onVideoGen?: (id: number) => void;
  onFrameGen?: (id: number, type: string) => void;
}

function buildGraph(
  sceneGroups: SceneGroup[],
  selectedItemId: number | null,
  onSelectItem: (id: number) => void,
  onVideoGen?: (id: number) => void,
  onFrameGen?: (id: number, type: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const GAP_X = 260;
  const GAP_Y = 400;
  let rowIdx = 0;

  for (const group of sceneGroups) {
    const sorted = [...group.items].sort(
      (a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id)
    );
    const y = rowIdx * GAP_Y;

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const x = i * GAP_X;
      const nodeData: StoryboardNodeData = {
        label: "\u955c\u5934 " + (i + 1),
        itemId: item.id,
        sceneId: item.sceneId ?? group.scene.id,
        episodeId: item.episodeId ?? group.scene.episodeId ?? 0,
        shotDescription: item.shotDescription,
        dialogue: item.dialogueText,
        frameUrl: item.frameUrl,
        videoUrl: item.videoUrl,
        duration: item.duration,
        cameraMove: item.cameraMove,
        shotType: item.shotType,
        frameType: item.frameType,
        selected: item.id === selectedItemId,
        onSelect: onSelectItem,
        onVideoGen: onVideoGen,
        onFrameGen: onFrameGen ? (id: number) => onFrameGen(id, "first") : undefined,
      };

      nodes.push({
        id: "item-" + item.id,
        type: "storyboard",
        position: { x, y },
        data: nodeData as unknown as Record<string, unknown>,
      });

      if (i > 0) {
        edges.push({
          id: "e-" + sorted[i - 1].id + "-" + item.id,
          source: "item-" + sorted[i - 1].id,
          target: "item-" + item.id,
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, opacity: 0.4 },
        });
      }
    }
    rowIdx++;
  }

  return { nodes, edges };
}

export function StoryboardCanvas({
  sceneGroups,
  selectedItemId,
  onSelectItem,
  onVideoGen,
  onFrameGen,
}: Props) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(sceneGroups, selectedItemId, onSelectItem, onVideoGen, onFrameGen),
    [sceneGroups, selectedItemId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  const handleAutoLayout = useCallback(() => {
    const { nodes: laid, edges: laidEdges } = buildGraph(
      sceneGroups, selectedItemId, onSelectItem, onVideoGen, onFrameGen
    );
    setNodes(laid);
    setEdges(laidEdges);
  }, [sceneGroups, selectedItemId, onSelectItem, onVideoGen, onFrameGen]);

  return (
    <div className="w-full h-[calc(100vh-12rem)] rounded-xl border border-border/30 bg-background overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        className="dark"
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, opacity: 0.4 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-20" />
        <MiniMap
          nodeStrokeWidth={2}
          zoomable
          pannable
          className="!bg-card/80 !border-border/30"
          maskColor="hsl(var(--background) / 0.7)"
        />
        <Panel position="bottom-right">
          <CanvasToolbar onAutoLayout={handleAutoLayout} />
        </Panel>
      </ReactFlow>
    </div>
  );
}

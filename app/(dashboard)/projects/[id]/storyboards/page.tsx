"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { usePipelineStore } from "@/lib/store/pipeline-store";
import {
  Film,
  Plus,
  Loader2,
  Sparkles,
  Table2,
  LayoutGrid,
  Camera,
  Menu,
  Info,
  Clapperboard,
  PlayCircle,
  AlertCircle,
  Map,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { VideoPreviewDialog } from "@/components/dashboard/video-preview-dialog";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { scriptApi, type ScriptEpisode } from "@/lib/api/script";
import {
  storyboardApi,
  type Storyboard,
  type StoryboardEpisode,
  type StoryboardFrameType,
  type StoryboardItem,
  type StoryboardScene,
} from "@/lib/api/storyboard";
import { StoryboardSidebar } from "./_components/storyboard-sidebar";
import { StoryboardTableView } from "./_components/storyboard-table-view";
import { StoryboardCardView } from "./_components/storyboard-card-view";
import {
  StoryboardRefPanel,
  type BatchFrameGeneratePayload,
} from "./_components/storyboard-ref-panel";
import {
  StoryboardFrameReferenceDialog,
  buildDefaultBatchFramePrompt,
} from "./_components/storyboard-frame-reference-dialog";
import { CreateStoryboardDialog } from "./_components/create-dialog";
import { StoryboardCanvas } from "./_components/canvas/storyboard-canvas";
import { EditItemAssetsDialog } from "./_components/edit-assets-dialog";
import { assetApi } from "@/lib/api/asset";
import { useFullWidth } from "@/lib/hooks/use-layout";
import { useProject } from "../project-context";

type ViewMode = "table" | "card" | "canvas";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "fusion-storyboard-sidebar-collapsed";

interface SidebarSelection {
  type: "all" | "episode" | "scene";
  episodeId?: number;
  sceneId?: number;
}

/** 鍦烘鍙婂叾鏉＄洰 */
interface SceneWithItems {
  scene: StoryboardScene;
  items: StoryboardItem[];
}

export default function StoryboardTabPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const { project } = useProject();
  const {
    addPipeline,
    attachTaskStream,
    setPanelExpanded,
    setExpandedTaskId,
    setNotificationOpen,
  } = usePipelineStore();

  // 鍒嗛暅椤靛缁堝崰婊?layout 瀹藉害
  useFullWidth(true);

  const [loading, setLoading] = useState(true);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [scriptEpisodes, setScriptEpisodes] = useState<ScriptEpisode[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // 鍏宠仈璧勪骇鐘舵€?
  const [assetsList, setAssetsList] = useState<import("@/lib/api/asset").AssetWithItems[]>([]);
  const [assetLookup, setAssetLookup] = useState<Record<number, { item: import("@/lib/api/asset").AssetItem; asset: import("@/lib/api/asset").Asset }>>({});
  const [editAssetsOpen, setEditAssetsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StoryboardItem | null>(null);

  const loadProjectAssets = useCallback(async () => {
    try {
      const list = await assetApi.listWithItems(projectId);
      setAssetsList(list);

      const lookup: Record<number, { item: import("@/lib/api/asset").AssetItem; asset: import("@/lib/api/asset").Asset }> = {};
      list.forEach((asset) => {
        if (asset.items && Array.isArray(asset.items)) {
          asset.items.forEach((item) => {
            lookup[item.id] = { item, asset };
          });
        }
      });
      setAssetLookup(lookup);
    } catch (err) {
      console.error("鍔犺浇璧勪骇澶辫触:", err);
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectAssets();
  }, [loadProjectAssets]);

  // 瑙嗗浘鐘舵€?
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // 鍔犺浇鏈湴鐢ㄦ埛鍋忓ソ
  useEffect(() => {
    const savedMode = localStorage.getItem("fusion-storyboard-view-mode");
    if (savedMode === "table" || savedMode === "card") {
      setViewMode(savedMode);
    }
    setIsSidebarCollapsed(
      localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
    );
  }, []);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("fusion-storyboard-view-mode", mode);
  }, []);
  const handleSetSidebarCollapsed = useCallback((collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false"
    );
  }, []);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [frameDialogItemId, setFrameDialogItemId] = useState<number | null>(null);
  const [frameDialogInitialType, setFrameDialogInitialType] =
    useState<StoryboardFrameType>("first");
  const [sidebarSelection, setSidebarSelection] = useState<SidebarSelection>({
    type: "episode",
  });
  const sidebarSelectionRef = useRef(sidebarSelection);
  useEffect(() => {
    sidebarSelectionRef.current = sidebarSelection;
  }, [sidebarSelection]);

  // 绉诲姩绔晶杈规爮鐘舵€?
  const [leftSheetOpen, setLeftSheetOpen] = useState(false);
  const [rightSheetOpen, setRightSheetOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleResize = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setLeftSheetOpen(false);
        setRightSheetOpen(false);
      }
    };
    handleResize(mediaQuery);
    mediaQuery.addEventListener("change", handleResize);
    return () => mediaQuery.removeEventListener("change", handleResize);
  }, []);

  // 鎸夊満娆″垎缁勬暟鎹?
  const [sceneGroups, setSceneGroups] = useState<SceneWithItems[]>([]);
  const [loadingScenes, setLoadingScenes] = useState(false);

  // 褰撳墠閫変腑闆嗙殑鍚堟垚鐘舵€?
  const [currentEpisode, setCurrentEpisode] = useState<StoryboardEpisode | null>(null);

  // 褰撳墠閫変腑鐨?episodeId锛坋pisode 鎴?scene 閫夋嫨閮戒細鏈夛級
  const currentEpisodeId =
    sidebarSelection.type === "episode" || sidebarSelection.type === "scene"
      ? sidebarSelection.episodeId ?? null
      : null;

  // 鎷夊彇褰撳墠闆嗚鎯咃紙鍚悎鎴愮姸鎬侊級
  const refreshCurrentEpisode = useCallback(async () => {
    if (!currentEpisodeId) {
      setCurrentEpisode(null);
      return;
    }
    try {
      const ep = await storyboardApi.getEpisode(currentEpisodeId);
      setCurrentEpisode(ep);
    } catch (err) {
      console.error("鍔犺浇闆嗚鎯呭け璐?", err);
    }
  }, [currentEpisodeId]);

  const [composedPreviewUrl, setComposedPreviewUrl] = useState<string | null>(null);
  const [runningComposeEpisodeIds, setRunningComposeEpisodeIds] = useState<number[]>([]);
  const [submittingComposeEpisodeIds, setSubmittingComposeEpisodeIds] = useState<number[]>([]);

  // 婊氬姩瀹氫綅 refs
  const sceneRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 婊氬姩鏃跺綋鍓嶅彲瑙佺殑鍦烘 ID锛堢敤浜庝晶杈规爮楂樹寒锛?
  const [activeSceneId, setActiveSceneId] = useState<number | null>(null);
  // 鏍囪鏄惁鐢辩敤鎴风偣鍑昏Е鍙戠殑婊氬姩锛堟鏃朵笉瑕侀€氳繃 observer 瑕嗙洊锛?
  const isUserScrollRef = useRef(false);

  // ========== 娲剧敓鏁版嵁 ==========

  const allItems = sceneGroups.flatMap((g) => g.items);
  const selectedItem = selectedItemId
    ? allItems.find((i) => i.id === selectedItemId) || null
    : null;
  const frameDialogItem = frameDialogItemId
    ? allItems.find((i) => i.id === frameDialogItemId) || null
    : null;

  // 褰撳墠婵€娲诲満娆＄殑鍒嗙粍锛堢敤浜庡彸渚ч潰鏉垮睍绀哄満娆¤祫浜э級
  const activeSceneGroup = activeSceneId
    ? sceneGroups.find((g) => g.scene.id === activeSceneId) || null
    : null;

  // 澶勭悊闀滃ご閫夋嫨锛屽悓鏃堕潤榛樺悓姝ュ畾浣嶈闀滃ご鎵€灞炵殑鍦烘
  const handleSelectItem = useCallback((itemId: number | null) => {
    setSelectedItemId(itemId);
    if (itemId) {
      const group = sceneGroups.find((g) => g.items.some((item) => item.id === itemId));
      if (group) {
        setActiveSceneId(group.scene.id);
      }
    }
  }, [sceneGroups]);

  // 鍔犺浇鍒嗛暅
  const loadStoryboard = useCallback(async () => {
    try {
      setLoading(true);
      const list = await storyboardApi.list(projectId);
      if (list.length > 0) {
        const activeStoryboard = list[0];
        setStoryboard(activeStoryboard);
        if (activeStoryboard.scriptId) {
          const episodes = await scriptApi.listEpisodes(activeStoryboard.scriptId);
          setScriptEpisodes(episodes);
        } else {
          setScriptEpisodes([]);
        }
      } else {
        setStoryboard(null);
        setScriptEpisodes([]);
        setSceneGroups([]);
      }
    } catch (err) {
      console.error("鍔犺浇鍒嗛暅澶辫触:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadStoryboard();
  }, [loadStoryboard]);

  const handleAiStoryboard = useCallback(async () => {
    try {
      const scripts = await scriptApi.list(projectId);
      const currentScript = scripts[0] ?? null;

      if (!currentScript) {
        alert("璇峰厛鍒涘缓鍓ф湰鍚庡啀浣跨敤 AI 鐢熸垚鍒嗛暅");
        return;
      }

      const storyboardTitle =
        currentScript.title?.trim() || project?.name?.trim() || "AI 鍒嗛暅";
      const scriptDisplayTitle =
        currentScript.title?.trim() || project?.name?.trim() || "鏈懡鍚嶉」鐩?;

      const newStoryboard = await storyboardApi.create({
        projectId,
        scriptId: currentScript.id,
        title: storyboardTitle,
      });

      const pipelineId = addPipeline({
        label: `AI 鐢熸垚鍒嗛暅 - ${scriptDisplayTitle}`,
        projectId,
        request: {
          agentType: "script_to_storyboard",
          category: "pipeline",
          title: `AI 鐢熸垚鍒嗛暅锛?{scriptDisplayTitle}`,
          projectId,
          context: {
            scriptId: currentScript.id,
            storyboardId: newStoryboard.id,
          },
        },
        onComplete: () => {
          loadStoryboard();
        },
      });

      setPanelExpanded(true);
      setExpandedTaskId(pipelineId);
      await loadStoryboard();
    } catch (err) {
      console.error("鍒涘缓鍒嗛暅璁板綍澶辫触:", err);
      alert("鍒涘缓鍒嗛暅璁板綍澶辫触锛岃閲嶈瘯");
    }
  }, [
    addPipeline,
    loadStoryboard,
    project?.name,
    projectId,
    setExpandedTaskId,
    setPanelExpanded,
  ]);

  const refreshStoryboardData = useCallback(async () => {
    try {
      void loadProjectAssets();
      void refreshCurrentEpisode();

      const list = await storyboardApi.list(projectId);
      let activeStoryboard = storyboard;
      if (list.length > 0) {
        activeStoryboard = list[0];
        setStoryboard(list[0]);
        if (activeStoryboard.scriptId) {
          const episodes = await scriptApi.listEpisodes(activeStoryboard.scriptId);
          setScriptEpisodes(episodes);
        } else {
          setScriptEpisodes([]);
        }
      } else {
        setStoryboard(null);
        setScriptEpisodes([]);
        setSceneGroups([]);
        return;
      }

      const selection = sidebarSelectionRef.current;
      let scenes: StoryboardScene[];
      if (selection.type === "episode" || selection.type === "scene") {
        if (selection.episodeId) {
          scenes = await storyboardApi.listScenesByEpisode(selection.episodeId);
        } else {
          scenes = [];
        }
      } else {
        scenes = await storyboardApi.listScenesByStoryboard(activeStoryboard.id);
      }

      const groups = await Promise.all(
        scenes.map(async (scene) => {
          const items = await storyboardApi.listItemsByScene(scene.id);
          return { scene, items };
        })
      );
      setSceneGroups(groups);
    } catch (err) {
      console.error("瀹屾暣鍒锋柊鍒嗛暅椤垫暟鎹け璐?", err);
    }
  }, [projectId, storyboard, loadProjectAssets, refreshCurrentEpisode]);

  const handleBindScriptEpisode = useCallback(async (
    storyboardEpisodeId: number,
    scriptEpisodeId: number
  ) => {
    const updated = await storyboardApi.bindScriptEpisode(storyboardEpisodeId, scriptEpisodeId);
    await refreshStoryboardData();
    return updated;
  }, [refreshStoryboardData]);

  const handleGenerateEpisodeStoryboard = useCallback(async (episode: StoryboardEpisode) => {
    if (!storyboard) return;
    if (!storyboard.scriptId) {
      alert("褰撳墠鍒嗛暅鏈叧鑱斿墽鏈紝鏃犳硶鎸夊崟闆嗛噸鏂扮敓鎴?);
      return;
    }
    if (!episode.scriptEpisodeId) {
      alert("璇峰厛缁戝畾鍓ф湰闆嗗悗鍐嶉噸鏂扮敓鎴愭湰闆嗗垎闀?);
      return;
    }

    const scriptEpisode = scriptEpisodes.find((item) => item.id === episode.scriptEpisodeId);
    const displayNumber = scriptEpisode?.episodeNumber ?? episode.episodeNumber ?? "?";
    const confirmed = confirm(`灏嗚鐩栫 ${displayNumber} 闆嗗凡鏈夊垎闀滃唴瀹癸紝涓嶅奖鍝嶅叾瀹冮泦銆傜‘瀹氱户缁紵`);
    if (!confirmed) return;

    try {
      await storyboardApi.clearEpisodeContent(episode.id);
      const pipelineId = addPipeline({
        label: `AI 鍒嗛暅 路 绗?${displayNumber} 闆哷,
        projectId,
        request: {
          agentType: "episode_storyboard_writer",
          category: "pipeline",
          title: `AI 鍒嗛暅 路 绗?${displayNumber} 闆哷,
          message: `璇蜂负鍓ф湰鍒嗛泦锛坰criptEpisodeId: ${episode.scriptEpisodeId}锛夌敓鎴愬垎闀滐紝骞朵繚瀛樺埌鍒嗛暅鑴氭湰 ${storyboard.id}銆俙,
          projectId,
          context: {
            scriptId: storyboard.scriptId,
            storyboardId: storyboard.id,
            scriptEpisodeId: episode.scriptEpisodeId,
          },
        },
        onComplete: () => {
          refreshStoryboardData();
        },
      });

      setPanelExpanded(true);
      setExpandedTaskId(pipelineId);
    } catch (err) {
      console.error("鍚姩鍗曢泦鍒嗛暅鐢熸垚澶辫触:", err);
      alert(err instanceof Error ? err.message : "鍚姩鍗曢泦鍒嗛暅鐢熸垚澶辫触锛岃閲嶈瘯");
    }
  }, [
    addPipeline,
    projectId,
    refreshStoryboardData,
    scriptEpisodes,
    setExpandedTaskId,
    setPanelExpanded,
    storyboard,
  ]);

  // AI 宸ュ叿鎵ц鍚庤嚜鍔ㄥ埛鏂?
  const storyboardsInvalidation = usePipelineStore((s) => s.invalidation.storyboards);
  const storyboardsInvRef = useRef(storyboardsInvalidation);
  useEffect(() => {
    if (storyboardsInvRef.current !== storyboardsInvalidation) {
      storyboardsInvRef.current = storyboardsInvalidation;
      refreshStoryboardData();
    }
  }, [storyboardsInvalidation, refreshStoryboardData]);

  // 鍔犺浇鍦烘鍒嗙粍鏁版嵁
  const loadSceneGroups = useCallback(
    async (episodeId?: number) => {
      if (!storyboard) return;
      setLoadingScenes(true);
      try {
        let scenes: StoryboardScene[];
        if (episodeId) {
          scenes = await storyboardApi.listScenesByEpisode(episodeId);
        } else {
          scenes = await storyboardApi.listScenesByStoryboard(storyboard.id);
        }

        // 骞惰鍔犺浇姣忎釜鍦烘鐨勬潯鐩?
        const groups = await Promise.all(
          scenes.map(async (scene) => {
            const items = await storyboardApi.listItemsByScene(scene.id);
            return { scene, items };
          })
        );

        setSceneGroups(groups);
      } catch (err) {
        console.error("鍔犺浇鍦烘澶辫触:", err);
      } finally {
        setLoadingScenes(false);
      }
    },
    [storyboard]
  );

  // 杩借釜褰撳墠宸插姞杞界殑闆咺D锛岄伩鍏嶅悓闆嗗唴鍒囨崲鍦烘閲嶅鍔犺浇
  const loadedEpisodeIdRef = useRef<number | null>(null);

  // sidebar 鍒濆鍖栧畬鎴愬悗閫氱煡 page 绗竴闆?episodeId
  const handleSidebarInitialLoad = useCallback((firstEpisodeId: number) => {
    setSidebarSelection({ type: "episode", episodeId: firstEpisodeId });
  }, []);

  // 褰撲晶杈规爮閫夋嫨鍙樺寲鏃跺姞杞芥暟鎹?
  useEffect(() => {
    if (!storyboard) return;

    if (sidebarSelection.type === "all") {
      setActiveSceneId(null);
      loadedEpisodeIdRef.current = null;
      loadSceneGroups();
    } else if (sidebarSelection.type === "episode" && sidebarSelection.episodeId) {
      setActiveSceneId(null);
      loadedEpisodeIdRef.current = sidebarSelection.episodeId;
      loadSceneGroups(sidebarSelection.episodeId);
    } else if (
      sidebarSelection.type === "scene" &&
      sidebarSelection.sceneId
    ) {
      const sceneExists = sceneGroups.some(
        (g) => g.scene.id === sidebarSelection.sceneId
      );
      // 鍚屼竴闆嗕笖鍦烘宸插瓨鍦ㄤ簬鏁版嵁涓細鐩存帴婊氬姩
      if (
        sidebarSelection.episodeId &&
        loadedEpisodeIdRef.current === sidebarSelection.episodeId &&
        sceneExists
      ) {
        setTimeout(() => {
          scrollToScene(sidebarSelection.sceneId!);
        }, 50);
      } else if (sidebarSelection.episodeId) {
        // 涓嶅悓闆?/ 棣栨鍔犺浇 / 鏂版坊鍔犵殑鍦烘锛氶噸鏂板姞杞芥暟鎹啀婊氬姩
        loadedEpisodeIdRef.current = sidebarSelection.episodeId;
        loadSceneGroups(sidebarSelection.episodeId).then(() => {
          setTimeout(() => {
            scrollToScene(sidebarSelection.sceneId!);
          }, 100);
        });
      }
    }
  }, [sidebarSelection, storyboard, loadSceneGroups]);

  // 婊氬姩鍒版寚瀹氬満娆?
  const scrollToScene = (sceneId: number) => {
    isUserScrollRef.current = true;
    setActiveSceneId(sceneId);
    const el = sceneRefs.current[sceneId];
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // 婊氬姩鍔ㄧ敾瀹屾垚鍚庢仮澶?observer
    setTimeout(() => {
      isUserScrollRef.current = false;
    }, 600);
  };

  // ========== 婊氬姩鐩戝惉锛氭洿鏂板綋鍓嶅彲瑙嗗満娆?==========
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || sceneGroups.length === 0) return;

    let ticking = false;

    const handleScroll = () => {
      if (isUserScrollRef.current) return;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollTop = container.scrollTop;
          const scrollHeight = container.scrollHeight;
          const clientHeight = container.clientHeight;

          // 1. 濡傛灉宸叉粴鍔ㄥ埌鏈€椤堕儴锛岀洿鎺ユ縺娲荤涓€涓満娆?
          if (scrollTop === 0) {
            setActiveSceneId(sceneGroups[0].scene.id);
            ticking = false;
            return;
          }

          // 2. 濡傛灉宸叉粴鍔ㄥ埌鏈€搴曢儴锛堣В鍐崇煭鍦烘鎴栧ぇ灞忓箷涓嬶紝鏈€鏈熬鍦烘鏃犳硶鍗峰埌椤堕儴瑙﹀彂婵€娲荤嚎鐨勯棶棰橈級
          if (scrollTop + clientHeight >= scrollHeight - 15) {
            setActiveSceneId(sceneGroups[sceneGroups.length - 1].scene.id);
            ticking = false;
            return;
          }

          // 3. 鏅€氭粴鍔ㄨ繃绋嬩腑锛屼娇鐢ㄨ緝涓虹伒鏁忕殑婵€娲荤嚎锛堝鍣ㄩ珮搴︾殑 35%锛屾渶澶т笉瓒呰繃 300px锛?
          const containerRect = container.getBoundingClientRect();
          let activeId: number | null = null;
          let minDiff = Infinity;
          const triggerY = Math.min(300, containerRect.height * 0.35);

          for (const { scene } of sceneGroups) {
            const el = sceneRefs.current[scene.id];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const relativeTop = rect.top - containerRect.top;
            const relativeBottom = rect.bottom - containerRect.top;

            // 鍒ゆ柇璇ュ満娆℃槸鍚﹁法瓒婂鍣ㄩ《閮ㄧ殑婵€娲荤嚎
            if (relativeTop <= triggerY && relativeBottom > triggerY) {
              activeId = scene.id;
              break;
            }

            // 澶囬€夛細濡傛灉娌℃湁璺ㄨ秺婵€娲荤嚎鐨勶紝璁板綍绂绘縺娲荤嚎鏈€杩戠殑涓€涓?
            const diff = Math.abs(relativeTop - triggerY);
            if (diff < minDiff) {
              minDiff = diff;
              activeId = scene.id;
            }
          }

          if (activeId !== null) {
            setActiveSceneId(activeId);
          }
          ticking = false;
        });

        ticking = true;
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    // 鍒濆鍖栨墽琛屼竴娆?
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [sceneGroups]);

  // ========== 鎿嶄綔 ==========

  const handleAddItem = async (sceneId: number, episodeId?: number) => {
    if (!storyboard) return;
    const group = sceneGroups.find((g) => g.scene.id === sceneId);
    const currentItems = group?.items || [];
    try {
      const newItem = await storyboardApi.createItem({
        storyboardId: storyboard.id,
        storyboardSceneId: sceneId,
        storyboardEpisodeId: episodeId,
        sortOrder: currentItems.length,
        shotNumber: String(currentItems.length + 1),
      });
      setSceneGroups((prev) =>
        prev.map((g) =>
          g.scene.id === sceneId
            ? { ...g, items: [...g.items, newItem] }
            : g
        )
      );
      setSelectedItemId(newItem.id);
    } catch (err) {
      console.error("娣诲姞鏂板垎闀滄潯鐩け璐?", err);
    }
  };

  const handleDeleteEpisode = async (episodeId: number) => {
    if (!confirm("纭畾瑕佸垹闄よ鍒嗛暅闆嗗悧锛熺浉鍏崇殑鍒嗛暅鍐呭涔熷皢琚垹闄ゃ€?)) return false;
    try {
      await storyboardApi.deleteEpisode(episodeId);
      if (
        sidebarSelection.episodeId === episodeId
      ) {
        setSidebarSelection({ type: "all" });
      }
      loadStoryboard();
      return true;
    } catch (err) {
      console.error("鍒犻櫎鍒嗛泦澶辫触:", err);
      return false;
    }
  };

  const handleDeleteScene = async (sceneId: number, episodeId: number) => {
    if (!confirm("纭畾瑕佸垹闄よ鍒嗛暅鍦烘鍚楋紵")) return false;
    try {
      await storyboardApi.deleteScene(sceneId);
      if (sidebarSelection.sceneId === sceneId) {
        setSidebarSelection({ type: "episode", episodeId });
      }
      loadSceneGroups(episodeId);
      return true;
    } catch (err) {
      console.error("鍒犻櫎鍒嗛暅澶存姤閿?, err);
      return false;
    }
  };

  const handleReorderScenes = async (episodeId: number, sortedScenes: import("@/lib/api/storyboard").StoryboardScene[]) => {
    try {
      await Promise.all(
        sortedScenes.map((scene, idx) =>
          storyboardApi.updateScene({ id: scene.id, sortOrder: idx })
        )
      );
      if (
        sidebarSelection.type === "all" ||
        sidebarSelection.episodeId === episodeId
      ) {
        loadSceneGroups(sidebarSelection.type === "all" ? undefined : episodeId);
      }
    } catch (err) {
      console.error("鏇存柊鎺掑簭澶辫触", err);
      throw err;
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm("纭畾瑕佸垹闄よ闀滃ご鍚楋紵")) return;
    try {
      await storyboardApi.deleteItem(itemId);
      setSceneGroups((prev) =>
        prev.map((g) => ({
          ...g,
          items: g.items.filter((i) => i.id !== itemId),
        }))
      );
      if (selectedItemId === itemId) setSelectedItemId(null);
      if (frameDialogItemId === itemId) setFrameDialogItemId(null);
    } catch (err) {
      console.error("鍒犻櫎鏉＄洰澶辫触:", err);
    }
  };

  const handleUpdateItemField = async (
    itemId: number,
    field: string,
    value: string | number | null
  ) => {
    try {
      const updated = await storyboardApi.updateItem({
        id: itemId,
        [field]: field === "duration" ? (value ? Number(value) : null) : value,
      });
      setSceneGroups((prev) =>
        prev.map((g) => ({
          ...g,
          items: g.items.map((i) => (i.id === updated.id ? updated : i)),
        }))
      );
    } catch (err) {
      console.error("鏇存柊鏉＄洰澶辫触:", err);
    }
  };

  const updateItemInSceneGroups = useCallback((updated: StoryboardItem) => {
    setSceneGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((i) => (i.id === updated.id ? updated : i)),
      }))
    );
  }, []);

  /** 鎵嬪姩鏇存柊闀滃ご棣栧熬甯?*/
  const handleUpdateItemFrame = useCallback(
    async (itemId: number, frameType: StoryboardFrameType, imageUrl: string | null) => {
      try {
        const updated = await storyboardApi.updateFrame(itemId, {
          frameType,
          imageUrl,
          prompt: null,
        });
        updateItemInSceneGroups(updated);
      } catch (err) {
        console.error("鏇存柊闀滃ご棣栧熬甯уけ璐?", err);
        throw err;
      }
    },
    [updateItemInSceneGroups]
  );

  /** 鎻愪氦闀滃ご棣栧熬甯?AI 鐢熸垚浠诲姟 */
  const handleGenerateItemFrame = useCallback(
    async (item: StoryboardItem, frameType: StoryboardFrameType, prompt: string) => {
      if (!storyboard) {
        throw new Error("缂哄皯鍒嗛暅涓婁笅鏂囷紝鏃犳硶鐢熸垚棣栧熬甯?);
      }
      const frameLabel = frameType === "first" ? "棣栧抚" : "灏惧抚";
      const shotLabel = item.shotNumber || item.autoShotNumber || String(item.id);
      try {
        setNotificationOpen(true);
        const pipelineId = addPipeline({
          label: `鐢熸垚闀滃ご ${shotLabel} ${frameLabel}`,
          projectId,
          request: {
            agentType: "storyboard_frame_gen",
            category: "pipeline",
            title: `鐢熸垚闀滃ご ${shotLabel} ${frameLabel}`,
            projectId,
            context: {
              selectedStoryboardItemIds: [item.id],
              storyboardId: storyboard.id,
              frameType,
              framePrompt: prompt,
            },
          },
          onComplete: () => {
            void refreshStoryboardData();
          },
        });
        setPanelExpanded(true);
        setExpandedTaskId(pipelineId);
      } catch (err) {
        console.error("鎻愪氦闀滃ご棣栧熬甯х敓鎴愪换鍔″け璐?", err);
        throw err;
      }
    },
    [
      addPipeline,
      projectId,
      refreshStoryboardData,
      setExpandedTaskId,
      setNotificationOpen,
      setPanelExpanded,
      storyboard,
    ]
  );

  /** 鎵归噺鎻愪氦褰撳墠鍦烘鐨勯灏惧抚 AI 鐢熸垚浠诲姟 */
  const handleBatchGenerateSceneFrames = useCallback(
    async ({
      episodeId,
      sceneId,
      firstItemIds,
      lastItemIds,
    }: BatchFrameGeneratePayload) => {
      if (!storyboard) {
        throw new Error("缂哄皯鍒嗛暅涓婁笅鏂囷紝鏃犳硶鐢熸垚棣栧熬甯?);
      }
      if (!episodeId || !sceneId) {
        alert("璇峰厛閫夋嫨鍦烘鍚庡啀鎵归噺鐢熸垚棣栧熬甯?);
        return;
      }
      const sceneGroup = sceneGroups.find((group) => group.scene.id === sceneId);
      if (!sceneGroup) {
        alert("褰撳墠鍦烘鏁版嵁鏈姞杞斤紝璇烽噸鏂伴€夋嫨鍦烘鍚庡啀璇?);
        return;
      }
      const allowedItemIds = new Set(sceneGroup.items.map((item) => item.id));
      const safeFirstItemIds = firstItemIds.filter((id) => allowedItemIds.has(id));
      const safeLastItemIds = lastItemIds.filter((id) => allowedItemIds.has(id));
      const tasks = [
        {
          frameType: "first" as const,
          itemIds: safeFirstItemIds,
          frameLabel: "棣栧抚",
          framePrompt: buildDefaultBatchFramePrompt("first"),
        },
        {
          frameType: "last" as const,
          itemIds: safeLastItemIds,
          frameLabel: "灏惧抚",
          framePrompt: buildDefaultBatchFramePrompt("last"),
        },
      ].filter((task) => task.itemIds.length > 0);

      if (tasks.length === 0) {
        alert("褰撳墠鍦烘棣栧熬甯у凡瀹屾暣锛屾棤闇€鐢熸垚");
        return;
      }

      const matchedEpisode = currentEpisode?.id === episodeId ? currentEpisode : null;
      const episodeLabel = matchedEpisode?.title?.trim()
        || (matchedEpisode?.episodeNumber != null
          ? `绗?${matchedEpisode.episodeNumber} 闆哷
          : `鍒嗛暅闆?${episodeId}`);
      const sceneLabel =
        sceneGroup.scene.sceneHeading ||
        (sceneGroup.scene.sceneNumber ? `鍦烘 ${sceneGroup.scene.sceneNumber}` : `鍦烘 ${sceneId}`);
      let firstPipelineId: string | null = null;

      for (const task of tasks) {
        const title = `鎵归噺鐢熸垚${episodeLabel} ${sceneLabel}${task.frameLabel}`;
        const pipelineId = addPipeline({
          label: `${title} (${task.itemIds.length} 涓暅澶?`,
          projectId,
          request: {
            agentType: "storyboard_frame_gen",
            category: "pipeline",
            title,
            projectId,
            context: {
              selectedStoryboardItemIds: task.itemIds,
              storyboardId: storyboard.id,
              frameType: task.frameType,
              framePrompt: task.framePrompt,
            },
          },
          onComplete: () => {
            void refreshStoryboardData();
          },
        });
        firstPipelineId = firstPipelineId || pipelineId;
      }

      setNotificationOpen(true);
      setPanelExpanded(true);
      if (firstPipelineId) {
        setExpandedTaskId(firstPipelineId);
      }
    },
    [
      addPipeline,
      currentEpisode,
      projectId,
      refreshStoryboardData,
      sceneGroups,
      setExpandedTaskId,
      setNotificationOpen,
      setPanelExpanded,
      storyboard,
    ]
  );

  /** 鎵撳紑鍗曚釜闀滃ご棣栧熬甯х紪杈戝脊绐?*/
  const handleOpenFrameDialog = useCallback(
    (item: StoryboardItem, frameType: StoryboardFrameType) => {
      setSelectedItemId(item.id);
      setFrameDialogItemId(item.id);
      setFrameDialogInitialType(frameType);
    },
    []
  );

  /** 鍏抽棴鍗曚釜闀滃ご棣栧熬甯х紪杈戝脊绐?*/
  const handleCloseFrameDialog = useCallback(() => {
    setFrameDialogItemId(null);
  }, []);

  // 鎷栨嫿鎺掑簭
  const handleReorderItems = async (
    sceneId: number,
    reorderedItems: import("@/lib/api/storyboard").StoryboardItem[]
  ) => {
    // 涔愯鏇存柊鏈湴鐘舵€?
    setSceneGroups((prev) =>
      prev.map((g) =>
        g.scene.id === sceneId ? { ...g, items: reorderedItems } : g
      )
    );
    // 鍚庡彴鎵归噺鏇存柊 sortOrder
    try {
      await storyboardApi.batchUpdateItemSort(
        reorderedItems.map((item) => item.id)
      );
    } catch (err) {
      console.error("鏇存柊鎺掑簭澶辫触:", err);
    }
  };



  useEffect(() => {
    refreshCurrentEpisode();
  }, [refreshCurrentEpisode]);

  /** 鎻愪氦鏈泦鍚堟垚瑙嗛浠诲姟 */
  const handleComposeEpisodeVideo = useCallback(async () => {
    if (!currentEpisodeId || !currentEpisode) return;
    if (
      submittingComposeEpisodeIds.includes(currentEpisodeId) ||
      runningComposeEpisodeIds.includes(currentEpisodeId) ||
      currentEpisode.composeStatus === 1
    ) {
      return;
    }

    const epLabel = currentEpisode.title?.trim()
      || (currentEpisode.episodeNumber != null ? `绗?${currentEpisode.episodeNumber} 闆哷 : `闆?${currentEpisode.id}`);
    setSubmittingComposeEpisodeIds((prev) =>
      prev.includes(currentEpisodeId) ? prev : [...prev, currentEpisodeId]
    );
    setNotificationOpen(true);
    try {
      const taskId = await storyboardApi.composeEpisodeVideo(currentEpisodeId);
      setSubmittingComposeEpisodeIds((prev) =>
        prev.filter((id) => id !== currentEpisodeId)
      );
      setRunningComposeEpisodeIds((prev) =>
        prev.includes(currentEpisodeId) ? prev : [...prev, currentEpisodeId]
      );

      attachTaskStream({
        label: `鍚堟垚鏈泦瑙嗛锛?{epLabel}`,
        projectId,
        taskId,
        cancellable: false,
        onSettled: () => {
          setRunningComposeEpisodeIds((prev) =>
            prev.filter((id) => id !== currentEpisodeId)
          );
          void refreshCurrentEpisode();
        },
      });

      void refreshCurrentEpisode();
    } catch (err) {
      console.error("鎻愪氦鍚堟垚浠诲姟澶辫触:", err);
      setSubmittingComposeEpisodeIds((prev) =>
        prev.filter((id) => id !== currentEpisodeId)
      );
      setRunningComposeEpisodeIds((prev) =>
        prev.filter((id) => id !== currentEpisodeId)
      );
    }
  }, [
    currentEpisodeId,
    currentEpisode,
    submittingComposeEpisodeIds,
    runningComposeEpisodeIds,
    projectId,
    attachTaskStream,
    setNotificationOpen,
    refreshCurrentEpisode,
  ]);

  /** 鍗曚釜闀滃ご鐢熸垚瑙嗛 */
  const handleVideoGen = useCallback(
    (itemId: number) => {
      if (!storyboard) return;
      const addPipeline = usePipelineStore.getState().addPipeline;
      const setNotificationOpen =
        usePipelineStore.getState().setNotificationOpen;

      addPipeline({
        label: `鐢熸垚瑙嗛 (闀滃ご #${itemId})`,
        projectId,
        request: {
          agentType: "storyboard_video_gen",
          projectId,
          context: {
            selectedStoryboardItemIds: [itemId],
            storyboardId: storyboard.id,
          },
        },
      });
      setNotificationOpen(true);
    },
    [projectId, storyboard]
  );

  // ========== 娓叉煋 ==========

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 绌虹姸鎬侊細娌℃湁鍒嗛暅
  if (!storyboard) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="h-20 w-20 rounded-2xl bg-linear-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 flex items-center justify-center mb-6 border border-cyan-500/10">
            <Film className="h-10 w-10 text-cyan-400/60" />
          </div>
          <h2 className="text-xl font-semibold mb-2">杩樻病鏈夊垎闀?/h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-md text-center">
            鎵嬪姩鍒涘缓鍒嗛暅琛ㄥ苟閫愭潯娣诲姞闀滃ご锛屾垨浣跨敤 AI 鏍规嵁鍓ф湰鑷姩鐢熸垚鍒嗛暅
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateDialog(true)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 hover:scale-[1.02]",
                "active:scale-[0.98] transition-all duration-200"
              )}
            >
              <Plus className="h-4 w-4" />
              鎵嬪姩鍒涘缓
            </button>
            <button
              onClick={handleAiStoryboard}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium",
                "bg-linear-to-r from-cyan-600 to-blue-600",
                "text-white shadow-lg shadow-cyan-500/20",
                "hover:shadow-cyan-500/30 hover:scale-[1.02]",
                "active:scale-[0.98] transition-all duration-200"
              )}
            >
              <Sparkles className="h-4 w-4" />
              AI 鐢熸垚鍒嗛暅
            </button>
          </div>
        </motion.div>
        <CreateStoryboardDialog
          open={showCreateDialog}
          projectId={projectId}
          projectName={project?.name}
          onClose={() => setShowCreateDialog(false)}
          onCreated={loadStoryboard}
        />
      </>
    );
  }

  // 鏈夊垎闀滐細涓夋爮甯冨眬
  return (
    <motion.div
      variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
      initial="hidden"
      animate="visible"
      className="flex h-full rounded-xl border border-border/20 overflow-hidden bg-card/10"
    >
      {/* 宸︽爮锛氬垎闀滅洰褰?*/}
      <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } } }} className="shrink-0 hidden xl:block">
      <StoryboardSidebar
        storyboardId={storyboard.id}
        selection={sidebarSelection}
        activeSceneId={activeSceneId}
        collapsed={isSidebarCollapsed}
        onSelect={setSidebarSelection}
        onCollapsedChange={handleSetSidebarCollapsed}
        onInitialLoad={handleSidebarInitialLoad}
        onDeleteEpisode={handleDeleteEpisode}
        onDeleteScene={handleDeleteScene}
        onReorderScenes={handleReorderScenes}
        scriptEpisodes={scriptEpisodes}
        onBindScriptEpisode={handleBindScriptEpisode}
        onGenerateEpisodeStoryboard={handleGenerateEpisodeStoryboard}
      />
      </motion.div>

      {/* 涓爮锛氭寜鍦烘鍒嗙粍鐨勫垎闀滃唴瀹?*/}
      <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } } }} className="flex-1 flex flex-col min-w-0">
        {/* 宸ュ叿鏍?*/}
        <div className="px-4 md:px-5 py-3 border-b border-border/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 max-w-[60%]">
            <Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
              <SheetTrigger
                render={
                  <button className="xl:hidden p-1.5 -ml-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors shrink-0">
                    <Menu className="h-5 w-5" />
                  </button>
                }
              />
              <SheetContent side="left" className="w-[300px] p-0 border-r-0 flex flex-col pt-12">
                <StoryboardSidebar
                  storyboardId={storyboard.id}
                  selection={sidebarSelection}
                  activeSceneId={activeSceneId}
                  onSelect={setSidebarSelection}
                  onInitialLoad={handleSidebarInitialLoad}
                  onDeleteEpisode={handleDeleteEpisode}
                  onDeleteScene={handleDeleteScene}
                  onReorderScenes={handleReorderScenes}
                  scriptEpisodes={scriptEpisodes}
                  onBindScriptEpisode={handleBindScriptEpisode}
                  onGenerateEpisodeStoryboard={handleGenerateEpisodeStoryboard}
                />
              </SheetContent>
            </Sheet>
            <h2 className="text-base font-semibold flex items-center gap-2 overflow-hidden">
              <Film className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">{storyboard.title || "鍒嗛暅琛?}</span>
              <span className="hidden sm:inline text-xs text-muted-foreground font-normal ml-1 shrink-0">
                路 {sceneGroups.length} 鍦烘 路 {allItems.length} 闀滃ご
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* 鍚堟垚鏈泦瑙嗛 */}
            {currentEpisodeId && currentEpisode && (() => {
              const cs = currentEpisode.composeStatus;
              const isSubmitting = submittingComposeEpisodeIds.includes(currentEpisodeId);
              const isRunning = runningComposeEpisodeIds.includes(currentEpisodeId) || cs === 1;
              if (isSubmitting) {
                return (
                  <button
                    disabled
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/30 bg-muted/20 text-muted-foreground shrink-0 cursor-not-allowed"
                    title="姝ｅ湪鎻愪氦鍚堟垚浠诲姟"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    鎻愪氦涓€?
                  </button>
                );
              }
              if (isRunning) {
                return (
                  <button
                    disabled
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/30 bg-muted/20 text-muted-foreground shrink-0 cursor-not-allowed"
                    title="姝ｅ湪鍚堟垚鏈泦瑙嗛锛岄璁?30s - 3min"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    鍚堟垚涓€?
                  </button>
                );
              }
              if (cs === 2 && currentEpisode.composedVideoUrl) {
                return (
                  <div className="hidden sm:flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setComposedPreviewUrl(currentEpisode.composedVideoUrl)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                      title="鏌ョ湅鏈泦鍚堟垚瑙嗛"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      鏌ョ湅鏈泦瑙嗛
                    </button>
                    <button
                      onClick={handleComposeEpisodeVideo}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/30 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      title="閲嶆柊鍚堟垚"
                    >
                      <Clapperboard className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }
              if (cs === 3) {
                return (
                  <button
                    onClick={handleComposeEpisodeVideo}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors shrink-0"
                    title={`涓婃澶辫触锛?{currentEpisode.composeErrorMsg || "鏈煡閿欒"}\n鐐瑰嚮閲嶈瘯`}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    閲嶈瘯鍚堟垚
                  </button>
                );
              }
              return (
                <button
                  onClick={handleComposeEpisodeVideo}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                  title="灏嗘湰闆嗘墍鏈夐暅澶磋棰戞寜椤哄簭鎷兼帴鎴愪竴涓畬鏁磋棰?
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  鍚堟垚鏈泦瑙嗛
                </button>
              );
            })()}

            {/* 瑙嗗浘鍒囨崲 */}
            <div className="flex items-center rounded-lg border border-border/30 bg-muted/20 p-0.5 shrink-0">
              <button
                onClick={() => handleSetViewMode("table")}
                className={cn(
                  "hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                  viewMode === "table"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="琛ㄦ牸瑙嗗浘"
              >
                <Table2 className="h-3.5 w-3.5" />
                琛ㄦ牸
              </button>
              <button
                onClick={() => handleSetViewMode("table")}
                className={cn(
                  "flex sm:hidden items-center justify-center w-8 h-8 rounded-md transition-all",
                  viewMode === "table"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="琛ㄦ牸瑙嗗浘"
              >
                <Table2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleSetViewMode("card")}
                className={cn(
                  "hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                  viewMode === "card"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="鍗＄墖瑙嗗浘"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                鍗＄墖
              </button>
              <button
                onClick={() => handleSetViewMode("card")}
                className={cn(
                  "flex sm:hidden items-center justify-center w-8 h-8 rounded-md transition-all",
                  viewMode === "card"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="鍗＄墖瑙嗗浘"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            {/* 鍙充晶杈规爮瑙﹀彂鍣?*/}
            <Sheet open={rightSheetOpen} onOpenChange={setRightSheetOpen}>
              <SheetTrigger
                render={
                  <button className="2xl:hidden p-1.5 -mr-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors shrink-0">
                    <Info className="h-5 w-5" />
                  </button>
                }
              />
              <SheetContent side="right" className="w-[300px] p-0 border-l-0 flex flex-col pt-12 overflow-y-auto">
                <StoryboardRefPanel
                  storyboard={storyboard}
                  items={allItems}
                  selectedItem={selectedItem}
                  activeSceneGroup={activeSceneGroup}
                  projectId={projectId}
                  project={project}
                  assetLookup={assetLookup}
                  onUpdateFrame={handleUpdateItemFrame}
                  onGenerateFrame={handleGenerateItemFrame}
                  onBatchGenerateFrames={handleBatchGenerateSceneFrames}
                  onEditAssets={(item) => {
                    setEditingItem(item);
                    setEditAssetsOpen(true);
                  }}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* 鍐呭鍖哄煙 - 鎸夊満娆℃粴鍔?*/}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-8"
        >
          {loadingScenes ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sceneGroups.length === 0 ? (
            <div className="text-center py-16">
              <Camera className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                鏆傛棤鍦烘锛岃鍦ㄥ乏渚х洰褰曞垱寤哄垎闀滈泦鍜屽満娆?
              </p>
            </div>
          ) : ( viewMode === "canvas" ? (
            <StoryboardCanvas
              sceneGroups={sceneGroups}
              selectedItemId={selectedItemId}
              onSelectItem={handleSelectItem}
              onVideoGen={handleVideoGen}
              onFrameGen={(id, type) => {
                handleOpenFrameDialog(id, type as "first" | "last");
              }}
            />
          ) : (
            sceneGroups.map(({ scene, items }) => (
              <div
                key={scene.id}
                data-scene-id={scene.id}
                ref={(el) => {
                  sceneRefs.current[scene.id] = el;
                }}
                className={cn(
                  "scroll-mt-4 p-5 rounded-2xl border transition-all duration-500 ease-out",
                  activeSceneId === scene.id
                    ? "bg-violet-500/1.5 border-violet-500/15 shadow-[0_2px_8px_-3px_rgba(139,92,246,0.04)] dark:bg-violet-500/0.5"
                    : "border-transparent bg-transparent"
                )}
                onClick={() => setActiveSceneId(scene.id)}
              >
                {/* 鍦烘鏍囬锛氱偣鍑绘椂浜﹀彲鍒囨崲婵€娲诲満娆?*/}
                <div 
                  className="flex items-center gap-2 mb-3 cursor-pointer group/title"
                  onClick={() => setActiveSceneId(scene.id)}
                >
                  <Camera className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    activeSceneId === scene.id ? "text-violet-500" : "text-primary/60 group-hover/title:text-primary"
                  )} />
                  <h3 className={cn(
                    "text-sm font-semibold transition-colors",
                    activeSceneId === scene.id ? "text-violet-600 dark:text-violet-400" : "group-hover/title:text-primary"
                  )}>
                    {scene.sceneHeading ||
                      `鍦烘 ${scene.sceneNumber || scene.id}`}
                  </h3>
                  {scene.location && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/30 text-muted-foreground">
                      {scene.intExt && `${scene.intExt} `}
                      {scene.location}
                      {scene.timeOfDay && ` ${scene.timeOfDay}`}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">
                    {items.length} 闀?
                  </span>
                </div>

                {/* 鍦烘鍐呯殑闀滃ご鍒楄〃 */}
                {viewMode === "table" ? (
                  <StoryboardTableView
                    items={items}
                    selectedItemId={selectedItemId}
                    onSelectItem={handleSelectItem}
                    onUpdateItemField={handleUpdateItemField}
                    onAddItem={() =>
                      handleAddItem(scene.id, scene.episodeId)
                    }
                    onDeleteItem={handleDeleteItem}
                    onReorderItems={(reordered) =>
                      handleReorderItems(scene.id, reordered)
                    }
                    onVideoGen={handleVideoGen}
                    onOpenFrameDialog={handleOpenFrameDialog}
                    assetLookup={assetLookup}
                    onEditAssets={(item) => {
                      setEditingItem(item);
                      setEditAssetsOpen(true);
                    }}
                  />
                ) : (
                  <StoryboardCardView
                    items={items}
                    selectedItemId={selectedItemId}
                    onSelectItem={handleSelectItem}
                    onAddItem={() =>
                      handleAddItem(scene.id, scene.episodeId)
                    }
                    onReorderItems={(reordered) =>
                      handleReorderItems(scene.id, reordered)
                    }
                    onVideoGen={handleVideoGen}
                    onOpenFrameDialog={handleOpenFrameDialog}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* 鍙虫爮锛氬紩鐢ㄤ俊鎭?*/}
      <motion.div variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } } }} className="shrink-0 hidden 2xl:block">
      <StoryboardRefPanel
        storyboard={storyboard}
        items={allItems}
        selectedItem={selectedItem}
        activeSceneGroup={activeSceneGroup}
        projectId={projectId}
        project={project}
        assetLookup={assetLookup}
        onUpdateFrame={handleUpdateItemFrame}
        onGenerateFrame={handleGenerateItemFrame}
        onBatchGenerateFrames={handleBatchGenerateSceneFrames}
        onEditAssets={(item) => {
          setEditingItem(item);
          setEditAssetsOpen(true);
        }}
      />
      </motion.div>

      <VideoPreviewDialog
        open={!!composedPreviewUrl}
        title="鏈泦鍚堟垚瑙嗛"
        videoUrl={composedPreviewUrl}
        onClose={() => setComposedPreviewUrl(null)}
      />

      <StoryboardFrameReferenceDialog
        key={`${frameDialogItemId ?? "closed"}-${frameDialogInitialType}`}
        open={frameDialogItemId !== null}
        item={frameDialogItem}
        project={project}
        initialFrameType={frameDialogInitialType}
        onClose={handleCloseFrameDialog}
        onUpdateFrame={handleUpdateItemFrame}
        onGenerateFrame={handleGenerateItemFrame}
      />

      <EditItemAssetsDialog
        open={editAssetsOpen}
        item={editingItem}
        assetsList={assetsList}
        onClose={() => {
          setEditAssetsOpen(false);
          setEditingItem(null);
        }}
        onConfirm={async ({ characterIds, sceneAssetItemId, propIds }) => {
          if (!editingItem) return;
          try {
            const updated = await storyboardApi.updateItem({
              id: editingItem.id,
              characterIds: characterIds,
              sceneAssetItemId: sceneAssetItemId,
              propIds: propIds,
            });
            // 灞€閮ㄦ洿鏂板満娆℃暟鎹姸鎬?
            setSceneGroups((prev) =>
              prev.map((g) => ({
                ...g,
                items: g.items.map((i) => (i.id === updated.id ? updated : i)),
              }))
            );
            setEditAssetsOpen(false);
            setEditingItem(null);
          } catch (err) {
            console.error("鏇存柊鍏宠仈璧勪骇澶辫触:", err);
            alert("淇濆瓨璧勪骇鍏宠仈澶辫触锛岃閲嶈瘯");
          }
        }}
      />
    </motion.div>
  );
}

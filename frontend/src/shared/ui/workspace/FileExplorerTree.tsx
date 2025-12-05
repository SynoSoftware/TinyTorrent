import { Checkbox } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { type ReactNode, useMemo, useState, useCallback } from "react";
import { formatBytes } from "../../utils/format";

export interface FileExplorerEntry {
  name: string;
  index: number;
  length?: number;
  percentDone?: number;
  wanted?: boolean;
}

interface FileExplorerTreeProps {
  files: FileExplorerEntry[];
  emptyMessage?: string;
  onFilesToggle?: (indexes: number[], wanted: boolean) => void | Promise<void>;
}

type FileExplorerNode = {
  id: string;
  name: string;
  isFolder: boolean;
  children?: FileExplorerNode[];
  indexes?: number[];
  file?: FileExplorerEntry;
};

const buildFileTree = (entries: FileExplorerEntry[]): FileExplorerNode[] => {
  if (!entries.length) return [];
  const root: FileExplorerNode[] = [];
  entries.forEach((entry) => {
    const normalizedPath = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    const segments = normalizedPath.split("/").filter(Boolean);
    if (!segments.length) return;
    let currentList = root;
    let currentPath = "";
    segments.forEach((segment, idx) => {
      const isLeaf = idx === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let node = currentList.find((candidate) => candidate.name === segment && candidate.isFolder === !isLeaf);
      if (!node) {
        node = {
          id: currentPath,
          name: segment,
          isFolder: !isLeaf,
          children: !isLeaf ? [] : undefined,
          indexes: !isLeaf ? [] : undefined,
          file: isLeaf ? entry : undefined,
        };
        currentList.push(node);
      }
      if (!isLeaf) {
        node.indexes?.push(entry.index);
        currentList = node.children!;
      }
    });
  });
  return root;
};

export function FileExplorerTree({ files, emptyMessage, onFilesToggle }: FileExplorerTreeProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const selectionMap = useMemo(() => {
    const map = new Map<number, boolean>();
    files.forEach((file) => {
      map.set(file.index, file.wanted ?? true);
    });
    return map;
  }, [files]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleFileToggle = useCallback(
    (index: number, wanted: boolean) => {
      onFilesToggle?.([index], wanted);
    },
    [onFilesToggle]
  );

  const handleFolderToggle = useCallback(
    (node: FileExplorerNode) => {
      const indexes = node.indexes ?? [];
      if (!indexes.length) return;
      const allSelected = indexes.every((index) => selectionMap.get(index));
      onFilesToggle?.(indexes, !allSelected);
    },
    [onFilesToggle, selectionMap]
  );

  const renderNode = useCallback(
    (node: FileExplorerNode, depth = 0): ReactNode => {
      const paddingLeft = depth * 16 + 8;
      if (node.isFolder) {
        const indexes = node.indexes ?? [];
        const count = indexes.length;
        const allSelected = count > 0 && indexes.every((index) => selectionMap.get(index));
        const someSelected = indexes.some((index) => selectionMap.get(index));
        const isExpanded = Boolean(expanded[node.id]);
        return (
          <div key={node.id}>
            <div
              className="flex items-center gap-2 py-2 cursor-pointer hover:bg-content1/10 rounded pl-1"
              style={{ paddingLeft }}
              onClick={(event) => {
                if ((event.target as Element).closest("button")) return;
                handleFolderToggle(node);
              }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpanded(node.id);
                }}
                className="flex items-center justify-center rounded-full p-1 text-foreground/60 hover:text-foreground"
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <div onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  isSelected={allSelected}
                  isIndeterminate={someSelected && !allSelected}
                  onValueChange={() => handleFolderToggle(node)}
                  classNames={{ wrapper: "m-0" }}
                />
              </div>
              <Folder size={16} className="text-foreground/50" />
              <div className="flex flex-col text-sm font-medium text-foreground leading-tight">
                <span className="text-foreground">{node.name}</span>
                <span className="text-[11px] text-foreground/50">{count} file{count === 1 ? "" : "s"}</span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && node.children?.length ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {node.children.map((child) => renderNode(child, depth + 1))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      }
      if (!node.file) return null;
      const fileWanted = selectionMap.get(node.file.index) ?? true;
      return (
        <div
          key={node.id}
          className="flex items-center gap-2 py-2 rounded hover:bg-content1/10 cursor-pointer"
          style={{ paddingLeft }}
          onClick={() => handleFileToggle(node.file!.index, !fileWanted)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <Checkbox
              isSelected={fileWanted}
              onValueChange={(value) => handleFileToggle(node.file!.index, Boolean(value))}
              classNames={{ wrapper: "m-0" }}
            />
          </div>
          <FileText size={16} className="text-foreground/50" />
          <div className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
            {node.name}
          </div>
          {typeof node.file.length === "number" && node.file.length > 0 && (
            <span className="text-[11px] font-mono text-foreground/50">{formatBytes(node.file.length)}</span>
          )}
          {typeof node.file.percentDone === "number" && (
            <span className="text-[11px] font-mono text-foreground/40">{(node.file.percentDone * 100).toFixed(0)}%</span>
          )}
        </div>
      );
    },
    [expanded, handleFileToggle, handleFolderToggle, selectionMap, toggleExpanded]
  );

  if (!files.length) {
    return (
      <div className="rounded-xl border border-content1/20 bg-content1/15 p-4 text-xs text-foreground/50 text-center">
        {emptyMessage ?? "No files available."}
      </div>
    );
  }

  return <div className="space-y-1">{tree.map((node) => renderNode(node, 0))}</div>;
}

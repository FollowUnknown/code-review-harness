import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DiffPreviewResponse, FileGroup, FilePreviewItem, GroupByMode } from "../../shared/types";

interface FileSelectorDialogProps {
  preview: DiffPreviewResponse;
  onConfirm: (selectedFiles: string[]) => void;
  onCancel: () => void;
}

export function FileSelectorDialog({ preview, onConfirm, onCancel }: FileSelectorDialogProps) {
  const [groupBy, setGroupBy] = useState<GroupByMode>("fileType");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => {
    // Default: select all except suggestedSkip groups
    const paths = new Set<string>();
    for (const group of preview.groups) {
      if (!group.suggestedSkip) {
        for (const f of group.files) {
          paths.add(f.path);
        }
      }
    }
    // If nothing would be selected, select all
    if (paths.size === 0) {
      for (const group of preview.groups) {
        for (const f of group.files) paths.add(f.path);
      }
    }
    return paths;
  });

  const toggleGroup = (group: FileGroup) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      const allSelected = group.files.every((f) => next.has(f.path));
      for (const f of group.files) {
        if (allSelected) next.delete(f.path);
        else next.add(f.path);
      }
      return next;
    });
  };

  const toggleFile = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPaths(new Set(preview.groups.flatMap((g) => g.files.map((f) => f.path))));
  };

  const deselectAll = () => setSelectedPaths(new Set());

  const invertSelection = () => {
    const allPaths = new Set(preview.groups.flatMap((g) => g.files.map((f) => f.path)));
    setSelectedPaths((prev) => {
      const next = new Set<string>();
      for (const p of allPaths) {
        if (!prev.has(p)) next.add(p);
      }
      return next;
    });
  };

  const skipLowRisk = () => {
    setSelectedPaths(new Set(
      preview.groups
        .filter((g) => g.key !== "C")
        .flatMap((g) => g.files.map((f) => f.path))
    ));
  };

  const skipAssets = () => {
    setSelectedPaths(new Set(
      preview.groups
        .filter((g) => !g.suggestedSkip)
        .flatMap((g) => g.files.map((f) => f.path))
    ));
  };

  const stats = useMemo(() => {
    const selectedFiles = preview.groups.flatMap((g) => g.files).filter((f) => selectedPaths.has(f.path));
    const batchEstimate = Math.max(1, Math.ceil(selectedFiles.length / 4));
    const tokenEstimate = batchEstimate * 2000 + Math.ceil(selectedFiles.reduce((s, f) => s + f.diffChars, 0) / 4);
    return { selected: selectedFiles.length, total: preview.totalFiles, batchEstimate, tokenEstimate };
  }, [selectedPaths, preview]);

  const tabs: { key: GroupByMode; label: string }[] = [
    { key: "fileType", label: "File Type" },
    { key: "directory", label: "Directory" },
    { key: "riskLevel", label: "Risk Level" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Select Files to Review</h2>
            <p className="text-xs text-slate-400 mt-0.5">{preview.totalFiles} files detected</p>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 text-xl">&times;</button>
        </div>

        {/* Group tabs */}
        <div className="px-5 py-2 border-b border-slate-700/50 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setGroupBy(tab.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                groupBy === tab.key
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Quick actions */}
        <div className="px-5 py-2 border-b border-slate-700/50 flex gap-2 flex-wrap">
          <button onClick={selectAll} className="text-xs text-slate-400 hover:text-blue-400 transition-colors">Select All</button>
          <button onClick={deselectAll} className="text-xs text-slate-400 hover:text-blue-400 transition-colors">Deselect All</button>
          <button onClick={invertSelection} className="text-xs text-slate-400 hover:text-blue-400 transition-colors">Invert</button>
          <button onClick={skipLowRisk} className="text-xs text-slate-400 hover:text-blue-400 transition-colors">Skip C-risk</button>
          <button onClick={skipAssets} className="text-xs text-slate-400 hover:text-blue-400 transition-colors">Skip Images/Styles</button>
        </div>

        {/* File groups */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {preview.groups.map((group) => {
            const allSelected = group.files.length > 0 && group.files.every((f) => selectedPaths.has(f.path));
            const someSelected = group.files.some((f) => selectedPaths.has(f.path));
            const isExpanded = expandedGroups.has(group.key);

            return (
              <div key={group.key} className="rounded-lg border border-slate-700/50 overflow-hidden">
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-700/30 transition-colors ${
                    group.suggestedSkip ? "bg-slate-800/50" : ""
                  }`}
                  onClick={() => {
                    toggleGroup(group);
                    toggleExpand(group.key);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={() => toggleGroup(group)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/30"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">{group.label}</span>
                      <span className="text-xs text-slate-500">{group.count} files</span>
                      {group.suggestedSkip && (
                        <span className="text-xs text-amber-500/70">(suggested skip)</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      +{group.newCount} new &middot; ~{group.modifiedCount} modified
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(group.key); }}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    {isExpanded ? "▲" : "▼"}
                  </button>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-2 space-y-1 bg-slate-900/30">
                        {group.files.map((file) => (
                          <label
                            key={file.path}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700/20 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPaths.has(file.path)}
                              onChange={() => toggleFile(file.path)}
                              className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-blue-500"
                            />
                            <span className="text-xs text-slate-300 truncate flex-1">{file.path}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              file.riskLevel === "S" ? "bg-red-900/50 text-red-400" :
                              file.riskLevel === "A" ? "bg-orange-900/50 text-orange-400" :
                              file.riskLevel === "B" ? "bg-yellow-900/50 text-yellow-400" :
                              "bg-slate-700 text-slate-400"
                            }`}>
                              {file.riskLevel}
                            </span>
                            {file.newFile && <span className="text-xs text-green-500">new</span>}
                          </label>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Selected <span className="text-white font-medium">{stats.selected}</span>/{stats.total} files
            &middot; ~{stats.batchEstimate} batches
            &middot; ~{(stats.tokenEstimate / 1000).toFixed(0)}K tokens
          </div>
          <button
            onClick={() => onConfirm(Array.from(selectedPaths))}
            disabled={stats.selected === 0}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            Start Review ({stats.selected} files)
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

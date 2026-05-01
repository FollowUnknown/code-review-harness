import type {
  FilePreviewItem,
  FileGroup,
  GroupByMode,
  DiffPreviewResponse,
} from "../../../shared/types";

// ---- Constants ----

const FILE_TYPE_CONFIG: Record<string, { label: string; order: number; suggestedSkip: boolean }> = {
  vue:   { label: "Vue",        order: 1,  suggestedSkip: false },
  js:    { label: "JavaScript", order: 2,  suggestedSkip: false },
  ts:    { label: "TypeScript", order: 3,  suggestedSkip: false },
  tsx:   { label: "TSX",        order: 4,  suggestedSkip: false },
  jsx:   { label: "JSX",        order: 5,  suggestedSkip: false },
  java:  { label: "Java",       order: 6,  suggestedSkip: false },
  style: { label: "Style",      order: 7,  suggestedSkip: true  },
  image: { label: "Image",      order: 8,  suggestedSkip: true  },
  config:{ label: "Config",     order: 9,  suggestedSkip: true  },
  other: { label: "Other",      order: 10, suggestedSkip: false },
};

const RISK_LEVEL_ORDER: Record<string, number> = {
  S: 1,
  A: 2,
  B: 3,
  C: 4,
};

const IMAGE_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp"]);
const STYLE_EXTENSIONS = new Set([".css", ".less", ".scss", ".sass"]);

// ---- Helpers ----

function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot).toLowerCase();
}

function classifyFileType(filePath: string): string {
  const ext = getFileExtension(filePath);
  const baseName = filePath.split("/").pop() ?? "";

  if (ext === ".vue") return "vue";
  if (ext === ".js" || ext === ".jsx") return "js";
  if (ext === ".ts") return "ts";
  if (ext === ".tsx") return "tsx";
  if (STYLE_EXTENSIONS.has(ext)) return "style";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === ".java") return "java";

  // Config detection: extension or known config file names
  if (
    ext === ".json" ||
    ext === ".yml" ||
    ext === ".yaml" ||
    baseName.includes("eslintrc") ||
    baseName.includes("prettierrc") ||
    baseName === ".gitignore"
  ) {
    return "config";
  }

  return "other";
}

function getDirectoryGroup(filePath: string): string {
  const segments = filePath.split("/");
  // Directory segments = all segments except the filename (last one)
  const dirSegments = segments.slice(0, -1);

  if (dirSegments.length === 0) {
    // Root-level file, use the full filename as the group key
    return filePath;
  }

  if (dirSegments[0] === "src") {
    // Take up to 3 directory segments for src-prefixed paths
    return dirSegments.slice(0, 3).join("/");
  }
  // Take up to 2 directory segments for other paths
  return dirSegments.slice(0, 2).join("/");
}

function buildFileGroup(
  key: string,
  label: string,
  files: FilePreviewItem[],
  suggestedSkip: boolean,
): FileGroup {
  return {
    key,
    label,
    count: files.length,
    newCount: files.filter((f) => f.newFile).length,
    modifiedCount: files.filter((f) => !f.newFile && !f.deletedFile).length,
    suggestedSkip,
    files,
  };
}

function isSkippableFile(file: FilePreviewItem): boolean {
  if (file.riskLevel === "C") return true;
  const fileType = classifyFileType(file.path);
  return fileType === "image" || fileType === "style";
}

// ---- Public API ----

export function groupByFileType(files: FilePreviewItem[]): FileGroup[] {
  const buckets = new Map<string, FilePreviewItem[]>();

  for (const file of files) {
    const type = classifyFileType(file.path);
    if (!buckets.has(type)) {
      buckets.set(type, []);
    }
    buckets.get(type)!.push(file);
  }

  const groups: FileGroup[] = [];
  for (const [type, groupFiles] of buckets) {
    const config = FILE_TYPE_CONFIG[type] ?? FILE_TYPE_CONFIG.other;
    groups.push(buildFileGroup(type, config.label, groupFiles, config.suggestedSkip));
  }

  groups.sort((a, b) => {
    const orderA = FILE_TYPE_CONFIG[a.key]?.order ?? FILE_TYPE_CONFIG.other.order;
    const orderB = FILE_TYPE_CONFIG[b.key]?.order ?? FILE_TYPE_CONFIG.other.order;
    return orderA - orderB;
  });

  return groups;
}

export function groupByDirectory(files: FilePreviewItem[]): FileGroup[] {
  const buckets = new Map<string, FilePreviewItem[]>();

  for (const file of files) {
    const dir = getDirectoryGroup(file.path);
    if (!buckets.has(dir)) {
      buckets.set(dir, []);
    }
    buckets.get(dir)!.push(file);
  }

  const groups: FileGroup[] = [];
  for (const [dir, groupFiles] of buckets) {
    const allRiskC = groupFiles.every((f) => f.riskLevel === "C");
    groups.push(buildFileGroup(dir, dir, groupFiles, allRiskC));
  }

  groups.sort((a, b) => b.count - a.count);

  return groups;
}

export function groupByRiskLevel(files: FilePreviewItem[]): FileGroup[] {
  const buckets = new Map<string, FilePreviewItem[]>();

  for (const file of files) {
    const level = file.riskLevel;
    if (!buckets.has(level)) {
      buckets.set(level, []);
    }
    buckets.get(level)!.push(file);
  }

  const groups: FileGroup[] = [];
  for (const [level, groupFiles] of buckets) {
    const suggestedSkip = level === "C";
    const label = `Risk ${level}`;
    groups.push(buildFileGroup(level, label, groupFiles, suggestedSkip));
  }

  groups.sort((a, b) => {
    const orderA = RISK_LEVEL_ORDER[a.key] ?? 99;
    const orderB = RISK_LEVEL_ORDER[b.key] ?? 99;
    return orderA - orderB;
  });

  return groups;
}

export function estimateBatchesAndTokens(
  files: FilePreviewItem[],
): { batchEstimate: number; tokenEstimate: number } {
  const batchEstimate = Math.ceil(files.length / 4);
  const totalDiffChars = files.reduce((sum, f) => sum + f.diffChars, 0);
  const tokenEstimate = batchEstimate * 2000 + Math.ceil(totalDiffChars / 4);

  return { batchEstimate, tokenEstimate };
}

export function analyzeDiffPreview(
  files: FilePreviewItem[],
  groupBy: GroupByMode = "fileType",
): DiffPreviewResponse {
  let groups: FileGroup[];

  switch (groupBy) {
    case "directory":
      groups = groupByDirectory(files);
      break;
    case "riskLevel":
      groups = groupByRiskLevel(files);
      break;
    case "fileType":
    default:
      groups = groupByFileType(files);
      break;
  }

  const skipCount = files.filter((f) => isSkippableFile(f)).length;
  const { batchEstimate, tokenEstimate } = estimateBatchesAndTokens(files);

  return {
    totalFiles: files.length,
    skipCount,
    groups,
    batchEstimate,
    tokenEstimate,
    triggerThreshold: files.length > 20,
  };
}

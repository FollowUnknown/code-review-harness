import path from "path";
import fs from "fs";
import type { GitLabDiff, ASTSymbol, ASTChangeInfo } from "../../../shared/types";

// Re-export for convenience
export type { ASTSymbol, ASTChangeInfo };

// ---------------------------------------------------------------------------
// Lazy-loaded tree-sitter
// ---------------------------------------------------------------------------

let parserInstance: import("web-tree-sitter").Parser | null = null;
const languageCache = new Map<string, import("web-tree-sitter").Language>();

const GRAMMARS_DIR = path.join(__dirname, "grammars");

const FILE_EXTENSIONS: Record<string, string> = {
  ".java": "java",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".vue": "javascript", // Vue SFC: extract <script> and parse as JS/TS
  ".svelte": "javascript",
};

const MAX_FILE_LINES = 5000;

async function ensureInit(): Promise<import("web-tree-sitter").Parser> {
  if (parserInstance) return parserInstance;

  // web-tree-sitter CJS export: { Parser, Language, ... }
  // ESM dynamic import: { default: { Parser, Language, ... }, Parser, Language, ... }
  const wts = await import("web-tree-sitter") as Record<string, unknown>;
  const ParserClass = (wts.Parser ?? (wts.default as Record<string, unknown>)?.Parser) as typeof import("web-tree-sitter").Parser;

  await ParserClass.init();

  parserInstance = new ParserClass();
  return parserInstance;
}

async function loadLanguage(lang: string): Promise<import("web-tree-sitter").Language | null> {
  if (languageCache.has(lang)) return languageCache.get(lang)!;

  const wasmFile = path.join(GRAMMARS_DIR, `tree-sitter-${lang}.wasm`);
  if (!fs.existsSync(wasmFile)) return null;

  await ensureInit();
  const wts = await import("web-tree-sitter") as Record<string, unknown>;
  const LanguageClass = (wts.Language ?? (wts.default as Record<string, unknown>)?.Language) as typeof import("web-tree-sitter").Language;
  const bytes = fs.readFileSync(wasmFile);
  const language = await LanguageClass.load(bytes);
  languageCache.set(lang, language);
  return language;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return FILE_EXTENSIONS[ext] ?? null;
}

// ---------------------------------------------------------------------------
// Diff line-range extraction
// ---------------------------------------------------------------------------

interface DiffHunk {
  addedLines: Set<number>;
  deletedLines: Set<number>;
}

function extractDiffLineRanges(diffText: string): DiffHunk {
  const addedLines = new Set<number>();
  const deletedLines = new Set<number>();
  let currentLine = 0;

  for (const line of diffText.split("\n")) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }
    if (line.startsWith("+")) {
      addedLines.add(currentLine);
      currentLine++;
    } else if (line.startsWith("-")) {
      // deleted lines don't advance the new-file line counter
    } else if (line.startsWith(" ")) {
      currentLine++;
    }
    // skip diff header lines and no-newline markers
  }

  return { addedLines, deletedLines };
}

// ---------------------------------------------------------------------------
// AST node classification
// ---------------------------------------------------------------------------

const INTERESTING_NODE_TYPES: Record<string, string> = {
  // Java + JS/TS shared
  class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  // Java specific
  method_declaration: "method",
  constructor_declaration: "method",
  field_declaration: "field",
  // JS/TS specific
  function_declaration: "function",
  generator_function_declaration: "function",
  method_definition: "method",
  arrow_function: "function",
  function_expression: "function",
  variable_declarator: "constant",
  lexical_declaration: "constant",
  variable_declaration: "constant",
  type_alias_declaration: "constant",
  export_statement: "function",
};

function isInterestingNode(nodeType: string): boolean {
  return nodeType in INTERESTING_NODE_TYPES;
}

function getEnclosingClass(node: import("web-tree-sitter").Node): string | null {
  let current = node.parent;
  while (current) {
    if (
      current.type === "class_declaration" ||
      current.type === "interface_declaration" ||
      current.type === "enum_declaration"
    ) {
      const nameNode = current.childForFieldName("name");
      return nameNode?.text ?? null;
    }
    current = current.parent;
  }
  return null;
}

function extractSignature(node: import("web-tree-sitter").Node): string {
  // Get the first line of the node text (signature line)
  const text = node.text;
  const firstLine = text.split("\n")[0];
  // Truncate if too long
  if (firstLine.length > 120) return firstLine.slice(0, 120) + "...";
  return firstLine;
}

function getNodeName(node: import("web-tree-sitter").Node): string | null {
  const nameField = node.childForFieldName("name");
  if (nameField) return nameField.text;

  // For variable declarations, the name is in the declarator
  if (node.type === "variable_declarator") {
    const nameNode = node.childForFieldName("name");
    return nameNode?.text ?? null;
  }

  // For export statements, get the exported child
  if (node.type === "export_statement") {
    const decl = node.children.find((c: import("web-tree-sitter").Node) => isInterestingNode(c.type));
    if (decl) return getNodeName(decl);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

function findSymbolsAtLines(
  tree: import("web-tree-sitter").Tree,
  addedLines: Set<number>
): ASTSymbol[] {
  const symbols: ASTSymbol[] = [];
  const seen = new Set<string>();

  const visit = (node: import("web-tree-sitter").Node) => {
    const startRow = node.startPosition.row + 1; // tree-sitter is 0-indexed
    const endRow = node.endPosition.row + 1;

    // Check if any changed line falls within this node's range
    let hasChangedLine = false;
    for (const line of addedLines) {
      if (line >= startRow && line <= endRow) {
        hasChangedLine = true;
        break;
      }
    }

    if (hasChangedLine && isInterestingNode(node.type)) {
      const name = getNodeName(node);
      const key = `${node.type}:${name}:${startRow}`;
      if (!seen.has(key) && name) {
        seen.add(key);
        symbols.push({
          name,
          kind: INTERESTING_NODE_TYPES[node.type] ?? "unknown",
          signature: extractSignature(node),
          changeType: "modified",
          enclosingClass: getEnclosingClass(node) ?? undefined,
          lineRange: { start: startRow, end: endRow },
        });
      }
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(tree.rootNode);
  return symbols;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function analyzeDiffFile(
  diff: GitLabDiff,
  fileContent?: string
): Promise<ASTChangeInfo | null> {
  const language = detectLanguage(diff.new_path);
  if (!language) return null;

  const lang = await loadLanguage(language);
  if (!lang) return null;

  // Get file content
  let content = fileContent;
  if (!content) {
    // Try to reconstruct from diff (use new file lines only)
    if (diff.new_file) {
      const lines = diff.diff.split("\n").filter((l) => l.startsWith("+") || l.startsWith(" "));
      content = lines.map((l) => l.slice(1)).join("\n");
    } else {
      // Can't parse without file content
      return null;
    }
  }

  // Vue/Svelte SFC: extract <script> section and compute line mapping
  let scriptLineStart = 0; // 1-indexed line number where <script> content begins
  if (diff.new_path.endsWith(".vue") || diff.new_path.endsWith(".svelte")) {
    const scriptTagMatch = content.match(/<script[^>]*>/);
    if (!scriptTagMatch) return null;
    if (scriptTagMatch.index === undefined) return null;
    // Line number where <script> tag starts (1-indexed)
    const beforeTag = content.slice(0, scriptTagMatch.index);
    scriptLineStart = beforeTag.split("\n").length; // line of <script> tag
    // Content starts on the line AFTER the <script> tag
    const contentStart = scriptTagMatch.index + scriptTagMatch[0].length;
    const beforeContent = content.slice(0, contentStart);
    scriptLineStart = beforeContent.split("\n").length; // line where script content begins

    const scriptContentMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptContentMatch) return null;
    content = scriptContentMatch[1].trim();
  }

  // Skip large files
  if (content.split("\n").length > MAX_FILE_LINES) return null;

  try {
    const parser = await ensureInit();
    parser.setLanguage(lang);
    const tree = parser.parse(content);
    if (!tree) return null;

    const { addedLines } = extractDiffLineRanges(diff.diff);
    if (addedLines.size === 0) {
      tree.delete();
      return null;
    }

    // Adjust line numbers for Vue/Svelte (map global line numbers to <script>-internal line numbers)
    const adjustedLines = scriptLineStart > 0
      ? new Set([...addedLines].map((l) => l - scriptLineStart + 1).filter((l) => l > 0))
      : addedLines;

    const changedSymbols = findSymbolsAtLines(tree, adjustedLines);
    tree.delete();

    if (changedSymbols.length === 0) return null;

    const changeSummary = buildChangeSummary(diff.new_path, changedSymbols);

    return {
      filePath: diff.new_path,
      language,
      changedSymbols,
      changeSummary,
    };
  } catch {
    return null;
  }
}

function buildChangeSummary(filePath: string, symbols: ASTSymbol[]): string {
  const fileName = path.basename(filePath);
  const lines: string[] = [];

  for (const sym of symbols) {
    const location = sym.enclosingClass
      ? `${sym.enclosingClass}.${sym.name}`
      : sym.name;
    const kindLabel =
      sym.kind === "method"
        ? "方法"
        : sym.kind === "function"
          ? "函数"
          : sym.kind === "class"
            ? "类"
            : sym.kind === "interface"
              ? "接口"
              : sym.kind === "field"
                ? "字段"
                : sym.kind === "enum"
                  ? "枚举"
                  : "声明";
    lines.push(`- [修改] ${kindLabel} \`${location}\``);
  }

  return `### ${fileName}\n${lines.join("\n")}`;
}

export function buildASTContextPrompt(changes: ASTChangeInfo[]): string {
  if (changes.length === 0) return "";

  let prompt = "\n\n## 变更语义分析（AST）\n\n";
  prompt += "以下是基于 AST 分析提取的变更语义，请在评审时参考：\n\n";

  for (const change of changes) {
    prompt += change.changeSummary + "\n";

    // Add signature details for methods/functions
    const withSigs = change.changedSymbols.filter(
      (s) => s.signature && (s.kind === "method" || s.kind === "function")
    );
    if (withSigs.length > 0) {
      prompt += "  签名详情:\n";
      for (const sym of withSigs) {
        const location = sym.enclosingClass
          ? `${sym.enclosingClass}.${sym.name}`
          : sym.name;
        prompt += `  - ${location}: \`${sym.signature}\`\n`;
      }
    }
    prompt += "\n";
  }

  return prompt;
}

export async function analyzeDiffsWithAST(
  diffs: GitLabDiff[],
  repoPath?: string
): Promise<ASTChangeInfo[]> {
  const results: ASTChangeInfo[] = [];

  for (const diff of diffs) {
    // Try to read actual file content if repoPath is available
    let fileContent: string | undefined;
    if (repoPath && !diff.deleted_file) {
      const fullPath = path.resolve(path.join(repoPath, diff.new_path));
      const resolvedRepo = path.resolve(repoPath);
      if (fullPath.startsWith(resolvedRepo + path.sep) && fs.existsSync(fullPath)) {
        try {
          fileContent = fs.readFileSync(fullPath, "utf-8");
        } catch {
          // ignore
        }
      }
    }

    const result = await analyzeDiffFile(diff, fileContent);
    if (result) results.push(result);
  }

  return results;
}

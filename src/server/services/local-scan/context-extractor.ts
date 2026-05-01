interface ExtractOptions {
  maxLines?: number;
}

export function extractFileContext(content: string, filePath: string, options: ExtractOptions = {}): string {
  const maxLines = options.maxLines ?? 300;

  // Vue files: extract script section
  if (filePath.endsWith(".vue") || filePath.endsWith(".svelte")) {
    const script = extractVueScript(content);
    if (script) return script;
    return "";
  }

  // CSS/SCSS: skip entirely
  if (/\.(css|scss|less|sass)$/.test(filePath)) {
    return "";
  }

  // TS/JS/Java: truncate to maxLines
  const lines = content.split("\n");
  if (lines.length <= maxLines) {
    return content;
  }

  return lines.slice(0, maxLines).join("\n") + "\n\n... [truncated, showing first " + maxLines + " lines] ...";
}

export function extractVueScript(content: string): string {
  // Extract <script> or <script setup> section
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const script = scriptMatch ? scriptMatch[1].trim() : "";

  if (!script && !content.includes("<template>")) {
    return "";
  }

  // Extract child component names from template (PascalCase tags)
  const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
  const childComponents: string[] = [];

  if (templateMatch) {
    const uniqueComponents = new Set<string>();
    const tagRegex = /<([A-Z][a-zA-Z]+)/g;
    let match;
    while ((match = tagRegex.exec(templateMatch[1])) !== null) {
      uniqueComponents.add(match[1]);
    }
    uniqueComponents.forEach((c) => childComponents.push(c));
  }

  // Build result
  let result = "";
  if (script) {
    result = "// <script> section:\n" + script;
  }

  if (childComponents.length > 0) {
    result += "\n\n// Child components used: " + childComponents.join(", ");
  }

  return result.trim();
}

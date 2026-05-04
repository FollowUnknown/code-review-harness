/**
 * Infer a business module name from an array of file paths.
 * Returns the most frequent module extracted from paths like "src/modules/aiDesign/...".
 * Returns undefined if no module can be inferred.
 */
export function inferModuleFromPaths(paths: string[]): string | undefined {
  const modulePatterns = [
    /^src\/(?:modules|pages|views|features|components)\/([^/]+)/,
  ];

  const freq = new Map<string, number>();
  for (const p of paths) {
    for (const pattern of modulePatterns) {
      const match = p.match(pattern);
      if (match) {
        freq.set(match[1], (freq.get(match[1]) || 0) + 1);
        break;
      }
    }
  }

  if (freq.size === 0) return undefined;
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export type SelectedTextSegment = {
  text: string;
  startLine: number;
  endLine: number;
  lineRange: string;
};

/**
 * 从多段选区合并文本与行号（按起始行排序）。
 */
export function mergeSelectedSegments(segments: SelectedTextSegment[]): {
  selectedText: string;
  lineNumber: string;
} {
  const sorted = [...segments].sort((a, b) => a.startLine - b.startLine);
  return {
    selectedText: sorted.map(s => s.text).join('\n'),
    lineNumber: sorted.map(s => s.lineRange).join('; '),
  };
}

/**
 * 从 VS Code 风格选区列表提取非空文本段（1-based 行号）。
 */
export function extractSegmentsFromSelections(
  getText: (startLine: number, endLine: number) => string,
  selections: Array<{ startLine: number; endLine: number }>,
): SelectedTextSegment[] {
  const segments: SelectedTextSegment[] = [];
  for (const selection of selections) {
    const text = getText(selection.startLine, selection.endLine).trim();
    if (!text) {
      continue;
    }
    const startLine = selection.startLine + 1;
    const endLine = selection.endLine + 1;
    segments.push({
      text,
      startLine,
      endLine,
      lineRange: `${startLine} ~ ${endLine}`,
    });
  }
  return segments;
}

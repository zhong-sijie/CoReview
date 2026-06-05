import * as vscode from 'vscode';

/**
 * 将行号范围字符串解析为文档 Range 数组。
 * 支持：单行 "10"、区间 "4 ~ 8" / "4 ～ 8"、多段 "4 ~ 8; 10 ~ 20"
 */
export function parseLineRangeToRanges(
  doc: vscode.TextDocument,
  lineRange: string,
): vscode.Range[] {
  const segments = (lineRange || '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  const ranges: vscode.Range[] = [];
  for (const seg of segments) {
    let m = seg.match(/^(\d+)\s*[~～]\s*(\d+)$/);
    if (m) {
      let start = parseInt(m[1], 10);
      let end = parseInt(m[2], 10);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        continue;
      }
      if (end < start) {
        [start, end] = [end, start];
      }
      const sLine = Math.max(0, Math.min(doc.lineCount - 1, start - 1));
      const eLine = Math.max(0, Math.min(doc.lineCount - 1, end - 1));
      ranges.push(
        new vscode.Range(
          new vscode.Position(sLine, 0),
          doc.lineAt(eLine).range.end,
        ),
      );
      continue;
    }

    m = seg.match(/^(\d+)$/);
    if (m) {
      const ln = parseInt(m[1], 10);
      if (Number.isNaN(ln)) {
        continue;
      }
      const line = Math.max(0, Math.min(doc.lineCount - 1, ln - 1));
      ranges.push(
        new vscode.Range(
          new vscode.Position(line, 0),
          doc.lineAt(line).range.end,
        ),
      );
    }
  }
  return ranges;
}

/** 将 Range 数组转为编辑器 Selection 并定位到第一段 */
export function applyLineRangesToEditor(
  editor: vscode.TextEditor,
  ranges: vscode.Range[],
): void {
  if (ranges.length === 0) {
    return;
  }
  editor.selections = ranges.map(r => new vscode.Selection(r.start, r.end));
  editor.revealRange(ranges[0], vscode.TextEditorRevealType.InCenter);
}

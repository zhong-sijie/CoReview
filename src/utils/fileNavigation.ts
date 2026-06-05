import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeFilePath } from '../../shared/utils';
import { applyLineRangesToEditor, parseLineRangeToRanges } from './lineRange';

/** 打开文件（相对/绝对路径回退） */
export async function openFileWithFallback(
  filePath: string,
): Promise<vscode.TextDocument> {
  const normalizedFilePath = normalizeFilePath(filePath);

  if (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const possiblePaths = [
      normalizedFilePath,
      path.join(workspaceRoot, normalizedFilePath),
      path.resolve(workspaceRoot, normalizedFilePath),
    ];

    for (const testPath of possiblePaths) {
      try {
        return await vscode.workspace.openTextDocument(
          vscode.Uri.file(testPath),
        );
      } catch {
        continue;
      }
    }
    throw new Error(`无法找到文件，尝试的路径: ${possiblePaths.join(', ')}`);
  }

  return vscode.workspace.openTextDocument(vscode.Uri.file(normalizedFilePath));
}

/** 打开文件并跳转到行号范围 */
export async function openFileAtLineRange(
  filePath: string,
  lineRange: string,
): Promise<void> {
  const document = await openFileWithFallback(filePath);
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active,
  });
  const ranges = parseLineRangeToRanges(editor.document, lineRange);
  applyLineRangesToEditor(editor, ranges);
}

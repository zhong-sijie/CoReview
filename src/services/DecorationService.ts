import * as vscode from 'vscode';
import { EnumConfirmResult } from '../../shared/enums';
import type { ReviewCommentItem } from '../../shared/types';
import { normalizeFilePath } from '../../shared/utils';
import { parseLineRangeToRanges } from '../utils/lineRange';

export type DecorationItem = {
  filePath: string;
  lineRange: string;
  hover?: string;
  status?: EnumConfirmResult;
};

/**
 * 管理评审意见在编辑器中的下划线装饰与 Hover。
 */
export class DecorationService {
  private underlineDecoration?: vscode.TextEditorDecorationType;
  private underlineDecorationAmber?: vscode.TextEditorDecorationType;
  private lastDecorationItems: DecorationItem[] = [];
  private disposables: vscode.Disposable[] = [];

  register(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.applyLastDecorationsIfAny();
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.applyLastDecorationsIfAny();
      }),
    );
    context.subscriptions.push({
      dispose: () => this.dispose(),
    });
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.underlineDecoration?.dispose();
    this.underlineDecorationAmber?.dispose();
  }

  applyLastDecorationsIfAny(): void {
    if (this.lastDecorationItems.length === 0) {
      return;
    }
    this.updateUnderlineDecorations(this.lastDecorationItems);
  }

  buildEntriesFromComments(comments: ReviewCommentItem[]): DecorationItem[] {
    const items: DecorationItem[] = [];
    const getFieldText = (fv: unknown): string => {
      const field = fv as { showName?: string; value?: unknown } | undefined;
      const val = field?.showName ?? field?.value ?? '';
      return typeof val === 'string' ? val.trim() : String(val ?? '');
    };

    const buildHover = (c: ReviewCommentItem): string => {
      const {
        identifier,
        type,
        priority,
        module: moduleField,
        comment,
        confirmNotes,
        reviewer,
        realConfirmer,
        assignConfirmer,
      } = c.values ?? {};

      const headerParts = [
        identifier?.value ? `ID: ${identifier.value}` : '',
        getFieldText(type),
        getFieldText(priority),
        getFieldText(moduleField),
      ].filter(Boolean);
      const header = headerParts.length ? `**${headerParts.join(' · ')}**` : '';

      const lines: string[] = [];
      if (header) {
        lines.push(header);
      }
      lines.push(`检视意见: ${getFieldText(comment) || '(无检视意见)'}`);
      const reviewerText = getFieldText(reviewer);
      if (reviewerText) {
        lines.push(`检视人员: ${reviewerText}`);
      }
      const confirmNotesText = getFieldText(confirmNotes);
      if (confirmNotesText) {
        lines.push(`确认说明: ${confirmNotesText}`);
      }
      const confirmerText =
        getFieldText(realConfirmer) || getFieldText(assignConfirmer);
      if (confirmerText) {
        lines.push(`确认人员: ${confirmerText}`);
      }
      return lines.join('\n\n');
    };

    for (const c of comments ?? []) {
      const filePath = getFieldText(c.values?.filePath);
      const lineRange = getFieldText(c.values?.lineRange);
      if (!filePath || !lineRange) {
        continue;
      }
      items.push({
        filePath,
        lineRange,
        hover: buildHover(c),
        status: c.values?.confirmResult?.value,
      });
    }
    return items;
  }

  computeDecorationItems(
    comments: ReviewCommentItem[] | null | undefined,
    addData: Record<string, ReviewCommentItem>,
  ): DecorationItem[] {
    const list: ReviewCommentItem[] = [...(comments ?? [])];
    for (const key of Object.keys(addData)) {
      const item = addData[key];
      if (item) {
        list.push(item);
      }
    }
    return this.buildEntriesFromComments(list);
  }

  updateUnderlineDecorations(items: DecorationItem[]): void {
    try {
      this.lastDecorationItems = items || [];
      this.ensureDecorationTypes();
      const normalizedItems = items
        .filter(it => it.filePath && it.lineRange)
        .map(it => ({
          ...it,
          filePath: normalizeFilePath(it.filePath),
        }));

      for (const editor of vscode.window.visibleTextEditors) {
        const docPath = normalizeFilePath(editor.document.uri.fsPath);
        const related = normalizedItems.filter(it =>
          pathsMatch(docPath, it.filePath),
        );

        if (related.length === 0) {
          editor.setDecorations(this.underlineDecoration!, []);
          editor.setDecorations(this.underlineDecorationAmber!, []);
          continue;
        }

        this.applyDecorationsToEditor(editor, related);
      }
    } catch {
      // ignore
    }
  }

  private ensureDecorationTypes(): void {
    if (!this.underlineDecoration) {
      this.underlineDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration:
          'underline; text-decoration-color: var(--vscode-editorInfo-foreground);',
        overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      });
    }
    if (!this.underlineDecorationAmber) {
      this.underlineDecorationAmber =
        vscode.window.createTextEditorDecorationType({
          textDecoration: 'underline; text-decoration-color: #ff9e35;',
          overviewRulerColor: '#ff9e35',
          overviewRulerLane: vscode.OverviewRulerLane.Right,
        });
    }
  }

  private applyDecorationsToEditor(
    editor: vscode.TextEditor,
    relatedItems: DecorationItem[],
  ): void {
    try {
      const optionsUnconfirmed: vscode.DecorationOptions[] = [];
      const optionsToModify: vscode.DecorationOptions[] = [];

      for (const it of relatedItems) {
        const ranges = parseLineRangeToRanges(editor.document, it.lineRange);
        for (const r of ranges) {
          const md = new vscode.MarkdownString(it.hover ?? '');
          md.isTrusted = true;

          if (
            it.status === EnumConfirmResult.Modified ||
            it.status === EnumConfirmResult.Rejected
          ) {
            continue;
          }
          if (it.status === EnumConfirmResult.ToModify) {
            optionsToModify.push({ range: r, hoverMessage: md });
          } else {
            optionsUnconfirmed.push({ range: r, hoverMessage: md });
          }
        }
      }

      editor.setDecorations(this.underlineDecoration!, optionsUnconfirmed);
      editor.setDecorations(this.underlineDecorationAmber!, optionsToModify);
    } catch {
      // ignore per-editor failure
    }
  }
}

function pathsMatch(docPath: string, itemPath: string): boolean {
  const normalizedItem = normalizeFilePath(itemPath);
  if (docPath === normalizedItem) {
    return true;
  }
  if (docPath.endsWith('/' + normalizedItem)) {
    return true;
  }
  if (normalizedItem.endsWith('/' + docPath)) {
    return true;
  }
  const docName = docPath.split('/').pop();
  const itemName = normalizedItem.split('/').pop();
  return Boolean(
    docName &&
    itemName &&
    docName === itemName &&
    docPath.includes(normalizedItem),
  );
}
